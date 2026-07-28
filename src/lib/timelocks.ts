export const MIN_LOCKTIME_OFFSET_BLOCKS = 288;
export const MIN_CROSS_CHAIN_SAFETY_BLOCKS = 72;
export const MAX_FUNDING_REGISTRATION_DELAY_BLOCKS = 12;

export function validateLockTimeOffset(value: unknown): number {
    const offset = Number(value);
    if (!Number.isSafeInteger(offset) || offset < MIN_LOCKTIME_OFFSET_BLOCKS) {
        throw new Error(`Locktime offset must be at least ${MIN_LOCKTIME_OFFSET_BLOCKS} blocks`);
    }
    return offset;
}

export const secondLockTimeOffset = (offset: number): number => Math.floor(offset / 2);

export function deadlineFromHeight(height: number, offset: number): number {
    if (!Number.isSafeInteger(height) || height <= 0) throw new Error('Current chain height is unavailable');
    const deadline = height + offset;
    if (!Number.isSafeInteger(deadline)) throw new Error('Calculated locktime is invalid');
    return deadline;
}

export function assertFundingDeadline(currentHeight: number, deadline: number, offset: number): void {
    const remaining = deadline - currentHeight;
    if (!Number.isSafeInteger(deadline)
        || remaining > offset
        || remaining < offset - MAX_FUNDING_REGISTRATION_DELAY_BLOCKS) {
        throw new Error(`Deadline must have ${offset - MAX_FUNDING_REGISTRATION_DELAY_BLOCKS}-${offset} blocks remaining`);
    }
}
