export const BIP110_MAX_ACTIVATION_HEIGHT = 965_664;

export type Bip110Activation = {
    ready: boolean;
    status: string;
    activationHeight: number | null;
    requiredHeight: number | null;
    source: 'rpc' | 'height-fallback' | 'unavailable';
};

export function activationFromBlockchainInfo(info: any): Bip110Activation {
    const deployment = info?.softforks?.reduced_data;
    const bip9 = deployment?.bip9;
    const status = String(bip9?.status ?? (deployment?.active ? 'active' : 'unknown')).toLowerCase();
    const activationHeight = Number.isSafeInteger(bip9?.since) ? bip9.since : null;

    return {
        ready: status === 'active' || deployment?.active === true,
        status,
        activationHeight,
        requiredHeight: activationHeight,
        source: 'rpc'
    };
}

export function mainnetHeightFallback(height: number): Bip110Activation {
    const validHeight = Number.isSafeInteger(height) && height >= 0;
    return {
        ready: validHeight && height >= BIP110_MAX_ACTIVATION_HEIGHT,
        status: validHeight && height >= BIP110_MAX_ACTIVATION_HEIGHT ? 'active' : 'awaiting-activation-height',
        activationHeight: BIP110_MAX_ACTIVATION_HEIGHT,
        requiredHeight: BIP110_MAX_ACTIVATION_HEIGHT,
        source: 'height-fallback'
    };
}

export const unavailableActivation = (): Bip110Activation => ({
    ready: false,
    status: 'unavailable',
    activationHeight: null,
    requiredHeight: null,
    source: 'unavailable'
});
