import { expect } from 'chai';
import {
    BIP110_MAX_ACTIVATION_HEIGHT,
    activationFromBlockchainInfo,
    mainnetHeightFallback
} from '../src/lib/bip110Activation';

describe('BIP110 activation safety gate', () => {
    it('unlocks only for the ACTIVE deployment state', () => {
        expect(activationFromBlockchainInfo({ softforks: { reduced_data: { bip9: { status: 'started' } } } }).ready).to.equal(false);
        expect(activationFromBlockchainInfo({ softforks: { reduced_data: { bip9: { status: 'locked_in', since: 100 } } } }).ready).to.equal(false);
        expect(activationFromBlockchainInfo({ softforks: { reduced_data: { bip9: { status: 'active', since: 200 } } } })).to.include({
            ready: true,
            activationHeight: 200,
            source: 'rpc'
        });
        expect(activationFromBlockchainInfo({ softforks: { reduced_data: { bip9: { status: 'expired' } } } }).ready).to.equal(false);
    });

    it('keeps explorer-only mainnet locked until the guaranteed activation height', () => {
        expect(mainnetHeightFallback(BIP110_MAX_ACTIVATION_HEIGHT - 1).ready).to.equal(false);
        expect(mainnetHeightFallback(BIP110_MAX_ACTIVATION_HEIGHT).ready).to.equal(true);
    });

    it('fails closed for missing deployment information', () => {
        expect(activationFromBlockchainInfo({}).ready).to.equal(false);
    });
});
