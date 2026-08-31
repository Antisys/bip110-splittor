import { finalizeEvent, type Event as NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools';
import { DbOffer } from '../webapp/backend/database/offersCrud';

function toBytes(input: Uint8Array | string): Uint8Array {
    if (input instanceof Uint8Array) return input;
    const bytes = new Uint8Array(input.length / 2);
    for (let i = 0; i < input.length; i += 2) {
        bytes[i / 2] = parseInt(input.substring(i, i + 2), 16);
    }
    return bytes;
}

export interface NostrOfferContent {
    v: number;
    side: 'sell_b110' | 'buy_b110';
    b110_amount_sats: number;
    btc_amount_sats: number;
    premium_pct: number;
    htlc_deadline_blocks: number;
    network: 'mainnet' | 'regtest';
    created_at: number;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export class OfferTranslator {

    static eventToOffer(event: NostrEvent, relayUrl?: string): Partial<DbOffer> {
        let content: NostrOfferContent;
        try {
            content = JSON.parse(event.content);
        } catch {
            return {};
        }

        const side = content.side || 'sell_b110';
        const isSellB110 = side === 'sell_b110';

        return {
            id: event.id,
            nostr_event_id: event.id,
            initiatorPubKey: event.pubkey,
            initiatorB110Amount: content.b110_amount_sats || 0,
            acceptorBtcAmount: content.btc_amount_sats || 0,
            lockTime: content.htlc_deadline_blocks || 144,
            networkMode: content.network || 'regtest',
            createdAt: content.created_at || event.created_at,
            status: 'OPEN',
            source: 'remote',
            relay_url: relayUrl,
            backingChain: isSellB110 ? 'bip110' : 'main'
        };
    }

    static offerToEvent(offer: DbOffer, secretKey: string): NostrEvent {
        const isSellB110 = offer.backingChain === 'bip110' || offer.backingChain === null;

        const content: NostrOfferContent = {
            v: 1,
            side: isSellB110 ? 'sell_b110' : 'buy_b110',
            b110_amount_sats: offer.initiatorB110Amount,
            btc_amount_sats: offer.acceptorBtcAmount,
            premium_pct: OfferTranslator.calculatePremium(
                offer.initiatorB110Amount,
                offer.acceptorBtcAmount,
                isSellB110 ? 'sell_b110' : 'buy_b110'
            ),
            htlc_deadline_blocks: offer.lockTime,
            network: offer.networkMode,
            created_at: offer.createdAt
        };

        const pubkey = getPublicKey(toBytes(secretKey));
        const tags: string[][] = [
            ['chain', 'bip110'],
            ['network', offer.networkMode],
            ['premium', String(content.premium_pct)],
            ['amount', String(offer.initiatorB110Amount)]
        ];

        const unsignedEvent: UnsignedEvent = {
            kind: 20110,
            content: JSON.stringify(content),
            tags,
            created_at: Math.floor(Date.now() / 1000),
            pubkey
        };

        return finalizeEvent(unsignedEvent, toBytes(secretKey));
    }

    static validateEventContent(content: any): ValidationResult {
        const errors: string[] = [];

        if (!content || typeof content !== 'object') {
            return { valid: false, errors: ['content is not an object'] };
        }

        if (content.v !== 1) {
            errors.push(`invalid version: ${content.v}, expected 1`);
        }

        if (!['sell_b110', 'buy_b110'].includes(content.side)) {
            errors.push(`invalid side: ${content.side}`);
        }

        if (!Number.isInteger(content.b110_amount_sats) || content.b110_amount_sats <= 0) {
            errors.push(`invalid b110_amount_sats: ${content.b110_amount_sats}`);
        }

        if (!Number.isInteger(content.btc_amount_sats) || content.btc_amount_sats <= 0) {
            errors.push(`invalid btc_amount_sats: ${content.btc_amount_sats}`);
        }

        if (typeof content.premium_pct !== 'number' || content.premium_pct < -50 || content.premium_pct > 100) {
            errors.push(`invalid premium_pct: ${content.premium_pct}`);
        }

        if (!Number.isInteger(content.htlc_deadline_blocks) || content.htlc_deadline_blocks <= 0) {
            errors.push(`invalid htlc_deadline_blocks: ${content.htlc_deadline_blocks}`);
        }

        if (!['mainnet', 'regtest'].includes(content.network)) {
            errors.push(`invalid network: ${content.network}`);
        }

        if (!Number.isInteger(content.created_at) || content.created_at <= 0) {
            errors.push(`invalid created_at: ${content.created_at}`);
        }

        return { valid: errors.length === 0, errors };
    }

    static calculatePremium(b110Amount: number, btcAmount: number, side: string): number {
        if (b110Amount <= 0 || btcAmount <= 0) return 0;

        let premium: number;
        if (side === 'sell_b110') {
            premium = ((btcAmount / b110Amount) - 1.0) * 100.0;
        } else {
            premium = ((b110Amount / btcAmount) - 1.0) * 100.0;
        }

        return Math.round(premium * 100) / 100;
    }

    static detectChain(side: string): 'main' | 'bip110' {
        return side === 'sell_b110' ? 'bip110' : 'main';
    }
}
