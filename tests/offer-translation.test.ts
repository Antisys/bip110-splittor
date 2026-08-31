import { expect } from 'chai';
import { generateSecretKey } from 'nostr-tools';
import { OfferTranslator } from '../src/lib/offerTranslation';
import { NostrClient } from '../src/lib/nostrClient';
import { DbOffer } from '../webapp/backend/database/offersCrud';

describe('OfferTranslator', () => {

    const sampleOffer: DbOffer = {
        id: 'test-id-001',
        status: 'OPEN',
        initiatorPubKey: 'a'.repeat(64),
        initiatorB110Amount: 500000,
        acceptorBtcAmount: 485000,
        hashLock: 'b'.repeat(64),
        lockTime: 144,
        networkMode: 'regtest',
        createdAt: 1725000000,
        backingChain: 'bip110'
    };

    describe('eventToOffer', () => {
        it('should translate a valid Nostr event to DbOffer', () => {
            const client = new NostrClient([], generateSecretKey());
            const content = {
                v: 1,
                side: 'sell_b110',
                b110_amount_sats: 500000,
                btc_amount_sats: 485000,
                premium_pct: -3.0,
                htlc_deadline_blocks: 144,
                network: 'regtest',
                created_at: 1725000000
            };
            const event = client.createEvent(20110, content, [['chain', 'bip110']]);
            const signed = client.signEvent(event);

            const offer = OfferTranslator.eventToOffer(signed, 'wss://relay.example.com');

            expect(offer.id).to.equal(signed.id);
            expect(offer.nostr_event_id).to.equal(signed.id);
            expect(offer.initiatorPubKey).to.equal(client.getPubkey());
            expect(offer.initiatorB110Amount).to.equal(500000);
            expect(offer.acceptorBtcAmount).to.equal(485000);
            expect(offer.lockTime).to.equal(144);
            expect(offer.networkMode).to.equal('regtest');
            expect(offer.source).to.equal('remote');
            expect(offer.relay_url).to.equal('wss://relay.example.com');
            expect(offer.status).to.equal('OPEN');
            expect(offer.backingChain).to.equal('bip110');
        });

        it('should return empty object for non-object JSON content', () => {
            const client = new NostrClient([], generateSecretKey());
            // JSON.stringify('not json') = '"not json"' — valid JSON string, not an object
            const event = client.createEvent(20110, 'not json');
            const signed = client.signEvent(event);

            const offer = OfferTranslator.eventToOffer(signed);
            expect(offer.initiatorB110Amount).to.equal(0);
            expect(offer.acceptorBtcAmount).to.equal(0);
        });

        it('should handle buy_b110 side correctly', () => {
            const client = new NostrClient([], generateSecretKey());
            const content = {
                v: 1,
                side: 'buy_b110',
                b110_amount_sats: 1000000,
                btc_amount_sats: 1020000,
                premium_pct: 2.0,
                htlc_deadline_blocks: 288,
                network: 'mainnet',
                created_at: 1725000000
            };
            const event = client.createEvent(20110, content);
            const signed = client.signEvent(event);

            const offer = OfferTranslator.eventToOffer(signed);
            expect(offer.backingChain).to.equal('main');
            expect(offer.initiatorB110Amount).to.equal(1000000);
            expect(offer.acceptorBtcAmount).to.equal(1020000);
        });
    });

    describe('offerToEvent', () => {
        it('should convert DbOffer to a signed Nostr event', () => {
            const sk = generateSecretKey();
            const event = OfferTranslator.offerToEvent(sampleOffer, sk);

            expect(event.kind).to.equal(20110);
            expect(event.pubkey).to.be.a('string').with.length(64);
            expect(event.sig).to.be.a('string').with.length(128);
            expect(event.tags).to.be.an('array').with.length.greaterThan(0);

            const content = JSON.parse(event.content);
            expect(content.v).to.equal(1);
            expect(content.side).to.equal('sell_b110');
            expect(content.b110_amount_sats).to.equal(500000);
            expect(content.btc_amount_sats).to.equal(485000);
            expect(content.network).to.equal('regtest');
        });

        it('should produce a verifiable event', () => {
            const sk = generateSecretKey();
            const event = OfferTranslator.offerToEvent(sampleOffer, sk);
            expect(NostrClient.verifyEvent(event)).to.be.true;
        });

        it('should set correct tags', () => {
            const sk = generateSecretKey();
            const event = OfferTranslator.offerToEvent(sampleOffer, sk);

            const chainTag = event.tags.find(t => t[0] === 'chain');
            const networkTag = event.tags.find(t => t[0] === 'network');
            const premiumTag = event.tags.find(t => t[0] === 'premium');
            const amountTag = event.tags.find(t => t[0] === 'amount');

            expect(chainTag).to.exist;
            expect(chainTag![1]).to.equal('bip110');
            expect(networkTag![1]).to.equal('regtest');
            expect(premiumTag).to.exist;
            expect(amountTag![1]).to.equal('500000');
        });
    });

    describe('Round-trip', () => {
        it('should round-trip: offerToEvent → eventToOffer preserves key fields', () => {
            const sk = generateSecretKey();
            const event = OfferTranslator.offerToEvent(sampleOffer, sk);
            const restored = OfferTranslator.eventToOffer(event);

            expect(restored.initiatorB110Amount).to.equal(sampleOffer.initiatorB110Amount);
            expect(restored.acceptorBtcAmount).to.equal(sampleOffer.acceptorBtcAmount);
            expect(restored.lockTime).to.equal(sampleOffer.lockTime);
            expect(restored.networkMode).to.equal(sampleOffer.networkMode);
            expect(restored.backingChain).to.equal(sampleOffer.backingChain);
        });
    });

    describe('validateEventContent', () => {
        it('should accept valid content', () => {
            const result = OfferTranslator.validateEventContent({
                v: 1,
                side: 'sell_b110',
                b110_amount_sats: 500000,
                btc_amount_sats: 485000,
                premium_pct: -3.0,
                htlc_deadline_blocks: 144,
                network: 'regtest',
                created_at: 1725000000
            });
            expect(result.valid).to.be.true;
            expect(result.errors).to.have.length(0);
        });

        it('should reject null/undefined content', () => {
            expect(OfferTranslator.validateEventContent(null).valid).to.be.false;
            expect(OfferTranslator.validateEventContent(undefined).valid).to.be.false;
        });

        it('should reject invalid version', () => {
            const result = OfferTranslator.validateEventContent({
                v: 2, side: 'sell_b110', b110_amount_sats: 500000,
                btc_amount_sats: 485000, premium_pct: -3.0,
                htlc_deadline_blocks: 144, network: 'regtest', created_at: 1725000000
            });
            expect(result.valid).to.be.false;
            expect(result.errors[0]).to.include('version');
        });

        it('should reject invalid side', () => {
            const result = OfferTranslator.validateEventContent({
                v: 1, side: 'invalid', b110_amount_sats: 500000,
                btc_amount_sats: 485000, premium_pct: -3.0,
                htlc_deadline_blocks: 144, network: 'regtest', created_at: 1725000000
            });
            expect(result.valid).to.be.false;
            expect(result.errors[0]).to.include('side');
        });

        it('should reject zero amounts', () => {
            const result = OfferTranslator.validateEventContent({
                v: 1, side: 'sell_b110', b110_amount_sats: 0,
                btc_amount_sats: 485000, premium_pct: -3.0,
                htlc_deadline_blocks: 144, network: 'regtest', created_at: 1725000000
            });
            expect(result.valid).to.be.false;
            expect(result.errors[0]).to.include('b110_amount_sats');
        });

        it('should reject out-of-range premium', () => {
            const result = OfferTranslator.validateEventContent({
                v: 1, side: 'sell_b110', b110_amount_sats: 500000,
                btc_amount_sats: 485000, premium_pct: -60,
                htlc_deadline_blocks: 144, network: 'regtest', created_at: 1725000000
            });
            expect(result.valid).to.be.false;
            expect(result.errors[0]).to.include('premium');
        });
    });

    describe('calculatePremium', () => {
        it('should calculate negative premium (discount) for sell_b110', () => {
            const p = OfferTranslator.calculatePremium(500000, 485000, 'sell_b110');
            expect(p).to.be.lessThan(0);
        });

        it('should calculate positive premium for buy_b110', () => {
            const p = OfferTranslator.calculatePremium(1020000, 1000000, 'buy_b110');
            expect(p).to.be.greaterThan(0);
        });

        it('should return 0 for equal amounts', () => {
            const p = OfferTranslator.calculatePremium(1000000, 1000000, 'sell_b110');
            expect(p).to.equal(0);
        });

        it('should return 0 for zero amounts', () => {
            const p = OfferTranslator.calculatePremium(0, 0, 'sell_b110');
            expect(p).to.equal(0);
        });
    });

    describe('detectChain', () => {
        it('should detect bip110 chain for sell_b110', () => {
            expect(OfferTranslator.detectChain('sell_b110')).to.equal('bip110');
        });

        it('should detect main chain for buy_b110', () => {
            expect(OfferTranslator.detectChain('buy_b110')).to.equal('main');
        });
    });
});
