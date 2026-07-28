import { expect } from 'chai';
import {
    assertFundingDeadline,
    deadlineFromHeight,
    secondLockTimeOffset,
    validateLockTimeOffset
} from '../src/lib/timelocks';

describe('HTLC timelock offsets', () => {
    it('derives each deadline from that chain current height', () => {
        expect(deadlineFromHeight(900_000, validateLockTimeOffset(1008))).to.equal(901_008);
        expect(deadlineFromHeight(700_000, secondLockTimeOffset(1008))).to.equal(700_504);
    });

    it('rejects unsafe offsets', () => {
        expect(() => validateLockTimeOffset(2)).to.throw('at least 288');
    });

    it('allows a short registration delay but rejects stale or overlong deadlines', () => {
        expect(() => assertFundingDeadline(900_002, 901_008, 1008)).not.to.throw();
        expect(() => assertFundingDeadline(900_020, 901_008, 1008)).to.throw();
        expect(() => assertFundingDeadline(900_000, 901_009, 1008)).to.throw();
    });
});
