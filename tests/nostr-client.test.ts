import { expect } from 'chai';
import { NostrClient } from '../src/lib/nostrClient';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

describe('NostrClient', () => {

    describe('Keypair Generation', () => {
        it('should generate a valid keypair', () => {
            const kp = NostrClient.generateKeypair();
            expect(kp.pubkey).to.be.a('string').with.length(64);
            expect(kp.secretKey).to.be.a('string').with.length(64);
        });

        it('should generate different keypairs each time', () => {
            const kp1 = NostrClient.generateKeypair();
            const kp2 = NostrClient.generateKeypair();
            expect(kp1.pubkey).to.not.equal(kp2.pubkey);
        });

        it('should derive correct pubkey from secret key', () => {
            const sk = generateSecretKey();
            const expectedPk = getPublicKey(sk);
            const client = new NostrClient([], sk);
            expect(client.getPubkey()).to.equal(expectedPk);
            expect(client.getSecretKey()).to.equal(sk);
        });
    });

    describe('Event Creation & Signing', () => {
        let client: NostrClient;

        beforeEach(() => {
            client = new NostrClient([], generateSecretKey());
        });

        it('should create a valid unsigned event', () => {
            const event = client.createEvent(20110, { test: 'data' }, [['tag1', 'val1']]);
            expect(event.kind).to.equal(20110);
            expect(event.content).to.equal(JSON.stringify({ test: 'data' }));
            expect(event.tags).to.deep.equal([['tag1', 'val1']]);
            expect(event.pubkey).to.equal(client.getPubkey());
            expect(event.created_at).to.be.greaterThan(0);
        });

        it('should create event with empty tags by default', () => {
            const event = client.createEvent(20110, { test: 'data' });
            expect(event.tags).to.deep.equal([]);
        });

        it('should sign an event and produce a valid signature', () => {
            const unsigned = client.createEvent(20110, { v: 1, side: 'sell_b110' });
            const signed = client.signEvent(unsigned);
            expect(signed.id).to.be.a('string').with.length(64);
            expect(signed.sig).to.be.a('string').with.length(128);
            expect(signed.kind).to.equal(20110);
            expect(signed.pubkey).to.equal(client.getPubkey());
        });

        it('should verify a valid signed event', () => {
            const unsigned = client.createEvent(20110, { v: 1 });
            const signed = client.signEvent(unsigned);
            expect(NostrClient.verifyEvent(signed)).to.be.true;
        });

        it('should reject a tampered event', () => {
            const unsigned = client.createEvent(20110, { v: 1 });
            const signed = client.signEvent(unsigned);
            // Create a fresh copy (without the verified Symbol cache)
            const tampered = {
                id: signed.id,
                kind: signed.kind,
                content: JSON.stringify({ v: 1, tampered: true }),
                tags: signed.tags,
                created_at: signed.created_at,
                pubkey: signed.pubkey,
                sig: signed.sig
            };
            expect(NostrClient.verifyEvent(tampered)).to.be.false;
        });

        it('should reject an event with wrong signature', () => {
            const unsigned = client.createEvent(20110, { v: 1 });
            const signed = client.signEvent(unsigned);
            const otherClient = new NostrClient([], generateSecretKey());
            const wrongSig = otherClient.signEvent(otherClient.createEvent(20110, { v: 1 })).sig;
            const badSig = {
                id: signed.id,
                kind: signed.kind,
                content: signed.content,
                tags: signed.tags,
                created_at: signed.created_at,
                pubkey: signed.pubkey,
                sig: wrongSig
            };
            expect(NostrClient.verifyEvent(badSig)).to.be.false;
        });

        it('should reject an event with wrong pubkey', () => {
            const client2 = new NostrClient([], generateSecretKey());
            const unsigned = client.createEvent(20110, { v: 1 });
            const signed = client.signEvent(unsigned);
            const wrongPk = {
                id: signed.id,
                kind: signed.kind,
                content: signed.content,
                tags: signed.tags,
                created_at: signed.created_at,
                pubkey: client2.getPubkey(),
                sig: signed.sig
            };
            expect(NostrClient.verifyEvent(wrongPk)).to.be.false;
        });
    });

    describe('Relay Status', () => {
        it('should report disconnected when no relays configured', () => {
            const client = new NostrClient([]);
            const statuses = client.getRelayStatuses();
            expect(statuses).to.deep.equal([]);
        });

        it('should report relay URLs', () => {
            const client = new NostrClient(['wss://relay1.example.com', 'wss://relay2.example.com']);
            const statuses = client.getRelayStatuses();
            expect(statuses).to.have.length(2);
            expect(statuses[0].url).to.equal('wss://relay1.example.com');
            expect(statuses[0].connected).to.be.false;
        });
    });
});
