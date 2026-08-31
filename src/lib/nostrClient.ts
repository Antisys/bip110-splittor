import {
    finalizeEvent,
    generateSecretKey,
    getPublicKey,
    verifyEvent as nostrVerifyEvent,
    type Event as NostrEvent,
    type UnsignedEvent
} from 'nostr-tools';
import { WebSocket } from 'ws';

function toHex(input: Uint8Array | string): string {
    const bytes = input instanceof Uint8Array ? input : toBytes(input);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBytes(input: Uint8Array | string): Uint8Array {
    if (input instanceof Uint8Array) return input;
    const bytes = new Uint8Array(input.length / 2);
    for (let i = 0; i < input.length; i += 2) {
        bytes[i / 2] = parseInt(input.substring(i, i + 2), 16);
    }
    return bytes;
}

export interface NostrKeypair {
    pubkey: string;
    secretKey: string;
}

export interface RelayStatus {
    url: string;
    connected: boolean;
    lastMessageAt?: number;
}

export class NostrClient {
    private relays: Map<string, WebSocket> = new Map();
    private relayUrls: string[];
    private secretKey: string;
    private pubkey: string;
    private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(relayUrls: string[], secretKey?: string) {
        this.relayUrls = relayUrls;
        if (secretKey) {
            this.secretKey = secretKey;
        } else {
            this.secretKey = toHex(generateSecretKey());
        }
        this.pubkey = getPublicKey(toBytes(this.secretKey));
    }

    static generateKeypair(): NostrKeypair {
        const sk = generateSecretKey();
        return {
            secretKey: toHex(sk),
            pubkey: getPublicKey(sk)
        };
    }

    getPubkey(): string {
        return this.pubkey;
    }

    getSecretKey(): string {
        return this.secretKey;
    }

    getRelayStatuses(): RelayStatus[] {
        return this.relayUrls.map(url => {
            const ws = this.relays.get(url);
            return {
                url,
                connected: ws?.readyState === WebSocket.OPEN
            };
        });
    }

    createEvent(kind: number, content: object, tags: string[][] = []): UnsignedEvent {
        return {
            kind,
            content: JSON.stringify(content),
            tags,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: this.pubkey
        };
    }

    signEvent(event: UnsignedEvent): NostrEvent {
        return finalizeEvent(event, toBytes(this.secretKey));
    }

    static verifyEvent(event: NostrEvent): boolean {
        return nostrVerifyEvent(event);
    }

    async connect(): Promise<void> {
        const promises = this.relayUrls.map(url => this.connectToRelay(url));
        await Promise.allSettled(promises);
    }

    private async connectToRelay(url: string): Promise<void> {
        return new Promise((resolve) => {
            if (this.relays.get(url)?.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            try {
                const ws = new WebSocket(url);
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve();
                }, 5000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    this.relays.set(url, ws);
                    resolve();
                });

                ws.on('error', () => {
                    clearTimeout(timeout);
                    this.scheduleReconnect(url);
                    resolve();
                });

                ws.on('close', () => {
                    this.relays.delete(url);
                    this.scheduleReconnect(url);
                });
            } catch {
                this.scheduleReconnect(url);
                resolve();
            }
        });
    }

    private scheduleReconnect(url: string): void {
        if (this.reconnectTimers.has(url)) return;
        const timer = setTimeout(() => {
            this.reconnectTimers.delete(url);
            this.connectToRelay(url);
        }, 5000);
        this.reconnectTimers.set(url, timer);
    }

    async publish(event: NostrEvent): Promise<{ url: string; ok: boolean; message?: string }[]> {
        const results: { url: string; ok: boolean; message?: string }[] = [];

        for (const [url, ws] of this.relays.entries()) {
            if (ws.readyState !== WebSocket.OPEN) {
                results.push({ url, ok: false, message: 'not connected' });
                continue;
            }

            try {
                const msg = JSON.stringify(['EVENT', event]);
                ws.send(msg);

                const result = await this.waitForOk(url, event.id, 5000);
                results.push({ url, ...result });
            } catch (err: any) {
                results.push({ url, ok: false, message: err.message });
            }
        }

        return results;
    }

    private waitForOk(url: string, eventId: string, timeoutMs: number): Promise<{ ok: boolean; message?: string }> {
        return new Promise((resolve) => {
            const ws = this.relays.get(url);
            if (!ws) {
                resolve({ ok: false, message: 'not connected' });
                return;
            }

            const handler = (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg[0] === 'OK' && msg[1] === eventId) {
                        clearTimeout(timer);
                        ws.removeListener('message', handler);
                        resolve({ ok: msg[2], message: msg[3] || undefined });
                    }
                } catch { /* ignore parse errors */ }
            };

            const timer = setTimeout(() => {
                ws.removeListener('message', handler);
                resolve({ ok: false, message: 'timeout' });
            }, timeoutMs);

            ws.on('message', handler);
        });
    }

    async subscribe(
        filter: { kinds: number[]; since?: number; until?: number },
        onEvent: (event: NostrEvent, relayUrl: string) => void
    ): Promise<void> {
        const subId = Math.random().toString(36).substring(2, 10);
        const req = ['REQ', subId, filter];

        for (const [url, ws] of this.relays.entries()) {
            if (ws.readyState !== WebSocket.OPEN) continue;

            ws.send(JSON.stringify(req));

            const handler = (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg[0] === 'EVENT' && msg[1] === subId) {
                        onEvent(msg[2], url);
                    }
                } catch { /* ignore */ }
            };

            ws.on('message', handler);
        }
    }

    async close(): Promise<void> {
        for (const timer of this.reconnectTimers.values()) {
            clearTimeout(timer);
        }
        this.reconnectTimers.clear();

        for (const [url, ws] of this.relays.entries()) {
            try {
                ws.close();
            } catch { /* ignore */ }
        }
        this.relays.clear();
    }
}
