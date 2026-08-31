import { finalizeEvent, type Event as NostrEvent, type UnsignedEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export interface SwapOffer {
  id: string;
  pubkey: string;
  side: 'sell_b110' | 'buy_b110';
  b110Amount: number;
  btcAmount: number;
  premiumPct: number;
  htlcDeadline: number;
  network: 'regtest' | 'mainnet';
  createdAt: number;
  sig?: string;
}

export interface SwapDetails {
  swapId: string;
  offerEventId: string;
  side: 'sell_b110' | 'buy_b110';
  htlcAddress: string;
  hashLock: string;
  claimPubKey: string;
  refundPubKey: string;
  lockTime: number;
  network: string;
  btcAmount: number;
  b110Amount: number;
  createdAt: number;
}

export class NostrClient {
  private relays: Map<string, WebSocket> = new Map();
  private secretKey: Uint8Array;
  private pubkey: string;
  private relayUrls: string[];
  private offerCallback?: (offer: SwapOffer) => void;
  private swapCallback?: (swap: SwapDetails) => void;

  constructor(relayUrls: string[]) {
    this.relayUrls = relayUrls;
    const saved = localStorage.getItem('bip110-dex-keypair');
    if (saved) {
      this.secretKey = hexToBytes(saved);
    } else {
      this.secretKey = generateSecretKey();
      localStorage.setItem('bip110-dex-keypair', bytesToHex(this.secretKey));
    }
    this.pubkey = getPublicKey(this.secretKey);
  }

  async connect(): Promise<void> {
    const promises = this.relayUrls.map(url => this.connectRelay(url));
    await Promise.allSettled(promises);
  }

  private async connectRelay(url: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          console.log(`[NOSTR] Connected to ${url}`);
          this.relays.set(url, ws);
          resolve();
        };
        ws.onerror = (e) => {
          console.error(`[NOSTR] Error connecting to ${url}:`, e);
          resolve();
        };
        ws.onmessage = (event) => this.handleMessage(event.data);
        ws.onclose = () => {
          console.log(`[NOSTR] Disconnected from ${url}`);
          this.relays.delete(url);
        };
      } catch (e) {
        console.error(`[NOSTR] Failed to create WebSocket for ${url}:`, e);
        resolve();
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg[0] === 'EVENT') {
        const event = msg[2] as NostrEvent;
        if (event.kind === 1 && event.tags?.some(t => t[0] === 't' && t[1] === 'bip110-swap')) {
          const offer = this.parseOffer(event);
          if (offer) this.offerCallback?.(offer);
        }
        if (event.kind === 1337 && event.tags?.some(t => t[0] === 't' && t[1] === 'bip110-htlc')) {
          const swap = this.parseSwapDetails(event);
          if (swap) this.swapCallback?.(swap);
        }
      } else if (msg[0] === 'OK') {
        const [eventId, success, msg2] = msg.slice(1);
        if (!success) {
          console.error(`[NOSTR] Event ${String(eventId).slice(0,16)} rejected:`, msg2);
        } else {
          console.log(`[NOSTR] Event ${String(eventId).slice(0,16)} accepted`);
        }
      }
    } catch {}
  }

  private parseOffer(event: NostrEvent): SwapOffer | null {
    try {
      const content = JSON.parse(event.content);
      if (content.v !== 1) return null;
      if (!['sell_b110', 'buy_b110'].includes(content.side)) return null;
      if (!content.b110_amount_sats || !content.btc_amount_sats) return null;

      return {
        id: event.id,
        pubkey: event.pubkey,
        side: content.side,
        b110Amount: content.b110_amount_sats,
        btcAmount: content.btc_amount_sats,
        premiumPct: content.premium_pct || 0,
        htlcDeadline: content.htlc_deadline_blocks || 144,
        network: content.network || 'regtest',
        createdAt: event.created_at,
        sig: event.sig
      };
    } catch {
      return null;
    }
  }

  onOffer(callback: (offer: SwapOffer) => void): void {
    this.offerCallback = callback;
  }

  onSwapDetails(callback: (swap: SwapDetails) => void): void {
    this.swapCallback = callback;
  }

  private parseSwapDetails(event: NostrEvent): SwapDetails | null {
    try {
      const content = JSON.parse(event.content);
      if (!content.htlc_address || !content.hash_lock) return null;
      return {
        swapId: content.swap_id || event.id,
        offerEventId: event.tags?.find(t => t[0] === 'a')?.[1] || '',
        side: content.side,
        htlcAddress: content.htlc_address,
        hashLock: content.hash_lock,
        claimPubKey: content.claim_pub_key || '',
        refundPubKey: content.refund_pub_key || '',
        lockTime: content.lock_time || 144,
        network: content.network || 'regtest',
        btcAmount: content.btc_amount_sats || 0,
        b110Amount: content.b110_amount_sats || 0,
        createdAt: event.created_at
      };
    } catch {
      return null;
    }
  }

  async publishSwapDetails(swap: Omit<SwapDetails, 'createdAt'>): Promise<string> {
    const content = {
      v: 1,
      swap_id: swap.swapId,
      side: swap.side,
      htlc_address: swap.htlcAddress,
      hash_lock: swap.hashLock,
      claim_pub_key: swap.claimPubKey,
      refund_pub_key: swap.refundPubKey,
      lock_time: swap.lockTime,
      network: swap.network,
      btc_amount_sats: swap.btcAmount,
      b110_amount_sats: swap.b110Amount
    };

    const event = finalizeEvent({
      kind: 1337,
      content: JSON.stringify(content),
      tags: [
        ['t', 'bip110-htlc'],
        ['a', swap.offerEventId],
        ['network', swap.network]
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.pubkey
    }, this.secretKey);

    await this.publish(event);
    return event.id;
  }

  subscribeSwapDetails(): void {
    const filter = { kinds: [1337], '#t': ['bip110-htlc'], limit: 50 };
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['REQ', 'swaps', filter]));
      }
    }
  }

  subscribeOffers(): void {
    const filter = { kinds: [1], '#t': ['bip110-swap'], limit: 100 };
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['REQ', 'offers', filter]));
      }
    }
  }

  async publishOffer(offer: Omit<SwapOffer, 'id' | 'pubkey' | 'createdAt' | 'sig'>): Promise<string> {
    const content = {
      v: 1,
      side: offer.side,
      b110_amount_sats: offer.b110Amount,
      btc_amount_sats: offer.btcAmount,
      premium_pct: offer.premiumPct,
      htlc_deadline_blocks: offer.htlcDeadline,
      network: offer.network,
      created_at: Math.floor(Date.now() / 1000)
    };

    const event = finalizeEvent({
      kind: 1,
      content: JSON.stringify(content),
      tags: [
        ['t', 'bip110-swap'],
        ['chain', 'bip110'],
        ['network', offer.network],
        ['premium', String(offer.premiumPct)],
        ['amount', String(offer.b110Amount)]
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.pubkey
    }, this.secretKey);

    await this.publish(event);
    return event.id;
  }

  async deleteOffer(eventId: string): Promise<void> {
    const event = finalizeEvent({
      kind: 5,
      content: '',
      tags: [['e', eventId]],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.pubkey
    }, this.secretKey);

    await this.publish(event);
  }

  private async publish(event: NostrEvent): Promise<void> {
    const msg = JSON.stringify(['EVENT', event]);
    console.log(`[NOSTR] Publishing event ${event.id?.slice(0,16)} to ${this.relays.size} relay(s)`);
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
        console.log(`[NOSTR] Sent to ${url}`);
      } else {
        console.warn(`[NOSTR] Cannot send to ${url} — state ${ws.readyState}`);
      }
    }
  }

  getPubkey(): string {
    return this.pubkey;
  }

  getRelayStatus(): { url: string; connected: boolean }[] {
    return this.relayUrls.map(url => ({
      url,
      connected: this.relays.get(url)?.readyState === WebSocket.OPEN
    }));
  }
}
