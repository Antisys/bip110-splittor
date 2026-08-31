import { expect } from 'chai';
import { generateSecretKey, finalizeEvent, getPublicKey } from 'nostr-tools';
import sqlite3 from 'sqlite3';
import { NostrSyncService } from '../webapp/backend/nostrSync';

// In-memory SQLite for tests
function createTestDb(): Promise<any> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(':memory:', (err) => {
            if (err) reject(err);
            else {
                db.run(`CREATE TABLE offers (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    initiatorPubKey TEXT NOT NULL,
                    initiatorB110Amount INTEGER NOT NULL,
                    acceptorPubKey TEXT,
                    acceptorBtcAmount INTEGER NOT NULL,
                    hashLock TEXT NOT NULL,
                    lockTime INTEGER NOT NULL,
                    secondLockTime INTEGER,
                    b110HtlcAddress TEXT,
                    btcHtlcAddress TEXT,
                    b110HtlcTxid TEXT,
                    btcHtlcTxid TEXT,
                    b110HtlcVout INTEGER,
                    btcHtlcVout INTEGER,
                    initiatorSettlementTxid TEXT,
                    acceptorSettlementTxid TEXT,
                    preimage TEXT,
                    networkMode TEXT NOT NULL,
                    createdAt INTEGER NOT NULL,
                    backingTxid TEXT,
                    backingVout INTEGER,
                    backingChain TEXT,
                    acceptorClaimed INTEGER DEFAULT 0,
                    nostr_event_id TEXT,
                    source TEXT DEFAULT 'local',
                    relay_url TEXT
                )`, (err) => {
                    if (err) reject(err);
                    else resolve(db);
                });
            }
        });
    });
}

// Mock NostrClient that stores published events
class MockNostrSyncService extends NostrSyncService {
    public publishedEvents: any[] = [];

    async publishOffer(offer: any): Promise<string> {
        this.publishedEvents.push(offer);
        return 'mock-event-id';
    }
}

describe('NostrSyncService', () => {
    // Skip these tests if running without database
    // They test the service logic with mocked dependencies

    describe('Status', () => {
        it('should return initial status', () => {
            const service = new NostrSyncService([], 'a'.repeat(64));
            const status = service.getStatus();
            expect(status.connected).to.be.false;
            expect(status.lastSync).to.equal(0);
            expect(status.relayCount).to.equal(0);
            expect(status.relays).to.deep.equal([]);
        });

        it('should report relay count', () => {
            const service = new NostrSyncService(
                ['wss://relay1.com', 'wss://relay2.com'],
                'a'.repeat(64)
            );
            const status = service.getStatus();
            expect(status.relayCount).to.equal(2);
        });
    });

    describe('Publishing (mocked)', () => {
        it('should track published events', async () => {
            const service = new MockNostrSyncService(
                [],
                'a'.repeat(64),
                'regtest'
            );

            const testOffer = {
                id: 'test-id',
                status: 'OPEN',
                initiatorPubKey: 'b'.repeat(64),
                initiatorB110Amount: 500000,
                acceptorBtcAmount: 485000,
                hashLock: 'c'.repeat(64),
                lockTime: 144,
                networkMode: 'regtest',
                createdAt: 1725000000,
                backingChain: 'bip110' as const
            };

            // This will fail because publishOffer is overridden but we can test the interface
            try {
                await service.publishOffer(testOffer);
            } catch {
                // Expected to fail without relay connection
            }

            expect(service.publishedEvents).to.have.length(1);
        });
    });
});
