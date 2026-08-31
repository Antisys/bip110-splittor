import { NostrClient, RelayStatus } from '../../src/lib/nostrClient';
import { OfferTranslator, ValidationResult } from '../../src/lib/offerTranslation';
import { dbRun, dbAll, dbGet } from './database/connection';
import { DbOffer } from './database/offersCrud';
import { logInfo, logWarn, logError } from './logger';
import { Event as NostrEvent } from 'nostr-tools';

export interface SyncResult {
    imported: number;
    updated: number;
    deleted: number;
    errors: string[];
}

export interface NostrSyncStatus {
    connected: boolean;
    lastSync: number;
    relayCount: number;
    relays: RelayStatus[];
    pubkey: string;
}

export class NostrSyncService {
    private client: NostrClient;
    private dbMode: 'mainnet' | 'regtest';
    private lastSyncTime: number = 0;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private offerKinds = [20110, 20111, 5];

    constructor(relayUrls: string[], secretKey: string, dbMode: 'mainnet' | 'regtest' = 'regtest') {
        this.client = new NostrClient(relayUrls, secretKey);
        this.dbMode = dbMode;
    }

    async start(): Promise<void> {
        logInfo('[NOSTR-SYNC] Starting Nostr sync service...');
        await this.client.connect();
        logInfo(`[NOSTR-SYNC] Connected to relays. Pubkey: ${this.client.getPubkey()}`);

        // Subscribe to offers
        await this.subscribeToOffers();

        // Periodic sync every 30 seconds
        this.syncInterval = setInterval(() => {
            this.syncFromRelays().catch(err => {
                logError('[NOSTR-SYNC] Periodic sync failed:', err.message);
            });
        }, 30000);

        // Initial sync
        await this.syncFromRelays();
    }

    async stop(): Promise<void> {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        await this.client.close();
        logInfo('[NOSTR-SYNC] Stopped.');
    }

    async syncFromRelays(): Promise<SyncResult> {
        const result: SyncResult = { imported: 0, updated: 0, deleted: 0, errors: [] };

        try {
            const since = this.lastSyncTime || Math.floor(Date.now() / 1000) - 3600;

            // Get existing local offers for dedup
            const localOffers = await dbAll(
                `SELECT id, nostr_event_id FROM offers WHERE networkMode = ? AND source = 'remote'`,
                [this.dbMode]
            );
            const knownIds = new Set(localOffers.map(o => o.nostr_event_id || o.id));

            // Fetch events from relays (via subscription)
            // The subscribeToOffers handles real-time; this is for catch-up
            const filter = { kinds: this.offerKinds, since };
            let eventsReceived = 0;

            await this.client.subscribe(filter, async (event: NostrEvent, relayUrl: string) => {
                eventsReceived++;
                try {
                    await this.processEvent(event, relayUrl, knownIds, result);
                } catch (err: any) {
                    result.errors.push(`Event ${event.id}: ${err.message}`);
                }
            });

            // Give relays a moment to respond
            await new Promise(resolve => setTimeout(resolve, 2000));

            this.lastSyncTime = Math.floor(Date.now() / 1000);
            logInfo(`[NOSTR-SYNC] Sync complete: ${result.imported} imported, ${result.updated} updated, ${result.deleted} deleted, ${result.errors.length} errors`);
        } catch (err: any) {
            result.errors.push(`Sync failed: ${err.message}`);
            logError('[NOSTR-SYNC] Sync failed:', err.message);
        }

        return result;
    }

    private async subscribeToOffers(): Promise<void> {
        const filter = { kinds: this.offerKinds, since: Math.floor(Date.now() / 1000) };

        await this.client.subscribe(filter, async (event: NostrEvent, relayUrl: string) => {
            try {
                const result: SyncResult = { imported: 0, updated: 0, deleted: 0, errors: [] };
                await this.processEvent(event, relayUrl, new Set(), result);

                if (result.imported > 0 || result.updated > 0) {
                    logInfo(`[NOSTR-SYNC] Real-time: ${result.imported} new, ${result.updated} updated from ${relayUrl}`);
                }
            } catch (err: any) {
                logError(`[NOSTR-SYNC] Real-time event error:`, err.message);
            }
        });
    }

    private async processEvent(
        event: NostrEvent,
        relayUrl: string,
        knownIds: Set<string>,
        result: SyncResult
    ): Promise<void> {
        // Verify signature
        if (!NostrClient.verifyEvent(event)) {
            result.errors.push(`Invalid signature: ${event.id}`);
            return;
        }

        // Handle deletion (kind 5)
        if (event.kind === 5) {
            await this.handleDeletion(event, result);
            return;
        }

        // Handle acceptance (kind 20111)
        if (event.kind === 20111) {
            await this.handleAcceptance(event, result);
            return;
        }

        // Handle offer (kind 20110)
        if (event.kind === 20110) {
            await this.handleOffer(event, relayUrl, knownIds, result);
            return;
        }
    }

    private async handleOffer(
        event: NostrEvent,
        relayUrl: string,
        knownIds: Set<string>,
        result: SyncResult
    ): Promise<void> {
        // Validate content
        let content: any;
        try {
            content = JSON.parse(event.content);
        } catch {
            result.errors.push(`Invalid JSON content: ${event.id}`);
            return;
        }

        const validation = OfferTranslator.validateEventContent(content);
        if (!validation.valid) {
            result.errors.push(`Invalid offer content ${event.id}: ${validation.errors.join(', ')}`);
            return;
        }

        // Only process offers for our network
        if (content.network !== this.dbMode) {
            return;
        }

        const offer = OfferTranslator.eventToOffer(event, relayUrl);
        if (!offer.id) return;

        // Check if already exists
        const existing = await dbGet(
            `SELECT id, status FROM offers WHERE id = ? OR nostr_event_id = ?`,
            [offer.id, offer.id]
        );

        if (existing) {
            // Update if status allows (don't overwrite accepted/funded offers)
            if (existing.status === 'OPEN') {
                await dbRun(
                    `UPDATE offers SET relay_url = ?, nostr_event_id = ? WHERE id = ?`,
                    [relayUrl, offer.id, existing.id]
                );
                result.updated++;
            }
        } else {
            // Insert new offer
            await dbRun(
                `INSERT INTO offers (id, status, initiatorPubKey, initiatorB110Amount, acceptorBtcAmount,
                 hashLock, lockTime, networkMode, createdAt, nostr_event_id, source, relay_url, backingChain)
                 VALUES (?, 'OPEN', ?, ?, ?, '', ?, ?, ?, ?, 'remote', ?, ?)`,
                [
                    offer.id,
                    offer.initiatorPubKey,
                    offer.initiatorB110Amount || 0,
                    offer.acceptorBtcAmount || 0,
                    offer.lockTime || 144,
                    offer.networkMode,
                    offer.createdAt,
                    relayUrl,
                    offer.backingChain || 'bip110'
                ]
            );
            result.imported++;
        }
    }

    private async handleDeletion(event: NostrEvent, result: SyncResult): Promise<void> {
        const tags = event.tags || [];
        const eTag = tags.find(t => t[0] === 'e');
        if (!eTag || !eTag[1]) return;

        const targetEventId = eTag[1];

        // Check that the deletion signer is the original offer creator
        const existing = await dbGet(
            `SELECT id, initiatorPubKey FROM offers WHERE id = ? OR nostr_event_id = ?`,
            [targetEventId, targetEventId]
        );

        if (!existing) return;

        if (existing.initiatorPubKey !== event.pubkey) {
            result.errors.push(`Deletion by non-creator rejected: ${event.id}`);
            return;
        }

        // Delete the offer
        await dbRun(`DELETE FROM offers WHERE id = ? OR nostr_event_id = ?`, [targetEventId, targetEventId]);
        result.deleted++;
        logInfo(`[NOSTR-SYNC] Offer deleted by creator: ${targetEventId}`);
    }

    private async handleAcceptance(event: NostrEvent, result: SyncResult): Promise<void> {
        let content: any;
        try {
            content = JSON.parse(event.content);
        } catch {
            return;
        }

        const offerEventId = content.offer_event_id;
        if (!offerEventId) return;

        // Update offer status
        const existing = await dbGet(
            `SELECT id, status FROM offers WHERE id = ? OR nostr_event_id = ?`,
            [offerEventId, offerEventId]
        );

        if (existing && existing.status === 'OPEN') {
            await dbRun(
                `UPDATE offers SET status = 'ACCEPTED', acceptorPubKey = ? WHERE id = ?`,
                [content.acceptor_pubkey || event.pubkey, existing.id]
            );
            result.updated++;
            logInfo(`[NOSTR-SYNC] Offer accepted: ${offerEventId}`);
        }
    }

    async publishOffer(offer: DbOffer): Promise<string> {
        const event = OfferTranslator.offerToEvent(offer, this.client.getSecretKey());
        const results = await this.client.publish(event);

        const successCount = results.filter(r => r.ok).length;
        if (successCount > 0) {
            logInfo(`[NOSTR-SYNC] Published offer ${event.id} to ${successCount}/${results.length} relays`);
        } else {
            logWarn(`[NOSTR-SYNC] Failed to publish offer ${event.id} to any relay`);
        }

        return event.id;
    }

    async deleteOffer(eventId: string): Promise<void> {
        const sk = this.client.getSecretKey();
        const pubkey = this.client.getPubkey();

        const event = this.client.createEvent(5, '', [['e', eventId]]);
        const signed = this.client.signEvent(event);
        await this.client.publish(signed);

        // Also delete from local DB
        await dbRun(`DELETE FROM offers WHERE id = ? OR nostr_event_id = ?`, [eventId, eventId]);
        logInfo(`[NOSTR-SYNC] Deleted offer ${eventId}`);
    }

    async signalAcceptance(eventId: string): Promise<void> {
        const event = this.client.createEvent(20111, {
            offer_event_id: eventId,
            acceptor_pubkey: this.client.getPubkey(),
            accepted_at: Math.floor(Date.now() / 1000)
        }, [['e', eventId]]);

        const signed = this.client.signEvent(event);
        await this.client.publish(signed);
        logInfo(`[NOSTR-SYNC] Signal acceptance for offer ${eventId}`);
    }

    getStatus(): NostrSyncStatus {
        return {
            connected: this.client.getRelayStatuses().some(r => r.connected),
            lastSync: this.lastSyncTime,
            relayCount: this.client.getRelayStatuses().length,
            relays: this.client.getRelayStatuses(),
            pubkey: this.client.getPubkey()
        };
    }
}
