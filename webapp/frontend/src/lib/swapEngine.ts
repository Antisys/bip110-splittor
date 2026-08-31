export interface SwapState {
  id: string;
  offerId: string;
  side: 'sell_b110' | 'buy_b110';
  status: 'pending' | 'funded' | 'claimed' | 'refunded';
  htlcAddress?: string;
  fundTxid?: string;
  claimTxid?: string;
  preimage?: string;
  hashLock?: string;
  btcAmount?: number;
  b110Amount?: number;
  network?: string;
  createdAt: number;
}

export class SwapEngine {
  private swaps: Map<string, SwapState> = new Map();

  generatePreimage(): { preimage: string; hashLock: string } {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const preimage = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const hashBytes = crypto.getRandomValues(new Uint8Array(32));
    const hashLock = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return { preimage, hashLock };
  }

  createSwapId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  initiateSwap(offerId: string, side: 'sell_b110' | 'buy_b110', amounts?: { btc: number; b110: number; network: string }): SwapState {
    const id = this.createSwapId();
    const { preimage, hashLock } = this.generatePreimage();
    
    const swap: SwapState = {
      id,
      offerId,
      side,
      status: 'pending',
      preimage,
      hashLock,
      btcAmount: amounts?.btc,
      b110Amount: amounts?.b110,
      network: amounts?.network,
      createdAt: Date.now()
    };
    
    this.swaps.set(id, swap);
    return swap;
  }

  getSwap(id: string): SwapState | undefined {
    return this.swaps.get(id);
  }

  getAllSwaps(): SwapState[] {
    return Array.from(this.swaps.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  updateSwap(id: string, updates: Partial<SwapState>): SwapState | undefined {
    const swap = this.swaps.get(id);
    if (!swap) return undefined;
    Object.assign(swap, updates);
    return swap;
  }
}
