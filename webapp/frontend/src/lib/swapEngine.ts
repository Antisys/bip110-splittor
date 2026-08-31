import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

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
  claimPubKey?: string;
  refundPubKey?: string;
  btcAmount?: number;
  b110Amount?: number;
  network?: string;
  lockTime?: number;
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

  getNetwork(net?: string): bitcoin.Network {
    if (net === 'mainnet') return bitcoin.networks.bitcoin;
    if (net === 'testnet') return bitcoin.networks.testnet;
    return bitcoin.networks.regtest;
  }

  createHtlcAddress(hashLockHex: string, claimPubKey: Buffer, refundPubKey: Buffer, lockTime: number, network: bitcoin.Network): string {
    const hashLock = Buffer.from(hashLockHex, 'hex');

    const claimScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_SHA256,
      hashLock,
      bitcoin.opcodes.OP_EQUALVERIFY,
      claimPubKey.subarray(1, 33),
      bitcoin.opcodes.OP_CHECKSIG
    ]);

    const locktimeBuffer = bitcoin.script.number.encode(lockTime);
    const refundScript = bitcoin.script.compile([
      locktimeBuffer,
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      refundPubKey.subarray(1, 33),
      bitcoin.opcodes.OP_CHECKSIG
    ]);

    const claimLeaf = { output: new Uint8Array(claimScript) };
    const refundLeaf = { output: new Uint8Array(refundScript) };

    const internalKey = claimPubKey.subarray(1, 33);

    const payment = bitcoin.payments.p2tr({
      internalPubkey: internalKey,
      scriptTree: [claimLeaf, refundLeaf],
      network
    });

    return payment.address!;
  }

  initiateSwap(offerId: string, side: 'sell_b110' | 'buy_b110', amounts?: { btc: number; b110: number; network: string }): SwapState {
    const id = this.createSwapId();
    const { preimage, hashLock } = this.generatePreimage();
    const network = this.getNetwork(amounts?.network);
    const lockTime = 144;

    const claimKeyPair = ECPair.makeRandom({ network });
    const refundKeyPair = ECPair.makeRandom({ network });

    const htlcAddress = this.createHtlcAddress(
      hashLock,
      claimKeyPair.publicKey,
      refundKeyPair.publicKey,
      lockTime,
      network
    );

    const swap: SwapState = {
      id,
      offerId,
      side,
      status: 'pending',
      preimage,
      hashLock,
      claimPubKey: claimKeyPair.publicKey.toString('hex'),
      refundPubKey: refundKeyPair.publicKey.toString('hex'),
      htlcAddress,
      btcAmount: amounts?.btc,
      b110Amount: amounts?.b110,
      network: amounts?.network,
      lockTime,
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
