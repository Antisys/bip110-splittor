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
  claimControlBlock?: string;
  refundControlBlock?: string;
  claimScriptHex?: string;
  refundScriptHex?: string;
  preimage?: string;
  hashLock?: string;
  claimPubKey?: string;
  claimPrivKey?: string;
  refundPubKey?: string;
  refundPrivKey?: string;
  btcAmount?: number;
  b110Amount?: number;
  network?: string;
  lockTime?: number;
  createdAt: number;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function tapleafHash(script: Uint8Array): Uint8Array {
  const prefix = concatBytes(
    new Uint8Array([0xc0]),
    new Uint8Array([script.length]),
    script
  );
  const hash = bitcoin.crypto.taggedHash('TapLeaf', Buffer.from(prefix));
  return new Uint8Array(hash);
}

function tapBranchHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [left, right] = Buffer.compare(Buffer.from(a), Buffer.from(b)) > 0 ? [b, a] : [a, b];
  return new Uint8Array(bitcoin.crypto.taggedHash('TapBranch', Buffer.concat([Buffer.from(left), Buffer.from(right)])));
}

export class SwapEngine {
  private swaps: Map<string, SwapState> = new Map();

  generatePreimage(): { preimage: string; hashLock: string } {
    const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
    const preimage = bytesToHex(preimageBytes);
    const hashLockBytes = new Uint8Array(bitcoin.crypto.sha256(Buffer.from(preimageBytes)));
    const hashLock = bytesToHex(hashLockBytes);
    return { preimage, hashLock };
  }

  createSwapId(): string {
    return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  }

  getNetwork(net?: string): bitcoin.Network {
    if (net === 'mainnet') return bitcoin.networks.bitcoin;
    if (net === 'testnet') return bitcoin.networks.testnet;
    return bitcoin.networks.regtest;
  }

  createHtlcAddress(hashLockHex: string, claimPubKeyHex: string, refundPubKeyHex: string, lockTime: number, network: bitcoin.Network) {
    const hashLock = hexToBytes(hashLockHex);
    const claimPubKey = hexToBytes(claimPubKeyHex);
    const refundPubKey = hexToBytes(refundPubKeyHex);
    const xOnlyClaim = claimPubKey.slice(1, 33);
    const xOnlyRefund = refundPubKey.slice(1, 33);

    const claimScript = concatBytes(
      new Uint8Array([0xa8]),
      new Uint8Array([0x20]),
      hashLock,
      new Uint8Array([0x88]),
      new Uint8Array([0x20]),
      xOnlyClaim,
      new Uint8Array([0xac])
    );

    const locktimeBytes: number[] = [];
    if (lockTime < 0x80) {
      locktimeBytes.push(lockTime);
    } else {
      locktimeBytes.push(0x02, lockTime & 0xff, (lockTime >> 8) & 0xff);
    }
    const refundScript = concatBytes(
      new Uint8Array(locktimeBytes),
      new Uint8Array([0xb1]),
      new Uint8Array([0x75]),
      new Uint8Array([0x20]),
      xOnlyRefund,
      new Uint8Array([0xac])
    );

    const claimLeafHash = tapleafHash(claimScript);
    const refundLeafHash = tapleafHash(refundScript);
    const merkleRoot = tapBranchHash(claimLeafHash, refundLeafHash);

    const tweakHash = new Uint8Array(bitcoin.crypto.taggedHash('TapTweak', Buffer.concat([Buffer.from(xOnlyClaim), Buffer.from(merkleRoot)])));
    const tweakResult = ecc.xOnlyPointAddTweak(xOnlyClaim, tweakHash);
    if (!tweakResult) throw new Error('Tweak failed');
    const parity = tweakResult.parity;

    const claimControlBlock = concatBytes(new Uint8Array([0xc0 | parity]), xOnlyClaim, refundLeafHash);
    const refundControlBlock = concatBytes(new Uint8Array([0xc0 | parity]), xOnlyClaim, claimLeafHash);

    const payment = bitcoin.payments.p2tr({
      internalPubkey: Buffer.from(xOnlyClaim),
      scriptTree: [{ output: claimScript }, { output: refundScript }],
      redeem: { output: claimScript },
      network
    });

    return {
      address: payment.address!,
      claimControlBlock: bytesToHex(claimControlBlock),
      refundControlBlock: bytesToHex(refundControlBlock),
      claimScriptHex: bytesToHex(claimScript),
      refundScriptHex: bytesToHex(refundScript)
    };
  }

  initiateSwap(offerId: string, side: 'sell_b110' | 'buy_b110', amounts?: { btc: number; b110: number; network: string }): SwapState {
    const id = this.createSwapId();
    const { preimage, hashLock } = this.generatePreimage();
    const network = this.getNetwork(amounts?.network);
    const lockTime = 288;

    const claimKeyPair = ECPair.makeRandom({ network });
    const refundKeyPair = ECPair.makeRandom({ network });

    const { address, claimControlBlock, refundControlBlock, claimScriptHex, refundScriptHex } = this.createHtlcAddress(
      hashLock,
      claimKeyPair.publicKey.toString('hex'),
      refundKeyPair.publicKey.toString('hex'),
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
      claimPrivKey: claimKeyPair.toWIF(),
      refundPubKey: refundKeyPair.publicKey.toString('hex'),
      refundPrivKey: refundKeyPair.toWIF(),
      htlcAddress: address,
      claimControlBlock,
      refundControlBlock,
      claimScriptHex,
      refundScriptHex,
      btcAmount: amounts?.btc,
      b110Amount: amounts?.b110,
      network: amounts?.network,
      lockTime,
      createdAt: Date.now()
    };

    this.swaps.set(id, swap);
    this.saveSwaps();
    return swap;
  }

  buildClaimTx(swapId: string, fundTxid: string, fundVout: number, fundValue: number, destinationAddress: string, feeSats: number): string {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    if (!swap.preimage || !swap.claimPrivKey || !swap.claimScriptHex || !swap.claimControlBlock) {
      throw new Error('Swap missing claim data');
    }

    const network = this.getNetwork(swap.network);
    const claimKeyPair = ECPair.fromWIF(swap.claimPrivKey, network);
    const xOnlyClaim = claimKeyPair.publicKey.slice(1, 33);

    const claimScript = hexToBytes(swap.claimScriptHex);
    const controlBlock = hexToBytes(swap.claimControlBlock);
    const preimage = hexToBytes(swap.preimage);

    const claimLeafHash = tapleafHash(claimScript);

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(fundTxid, 'hex').reverse(), fundVout);
    tx.addOutput(bitcoin.address.toOutputScript(destinationAddress, network), BigInt(fundValue - feeSats));

    const utxoScript = Buffer.from(bitcoin.address.toOutputScript(swap.htlcAddress!, network));
    const utxoValue = BigInt(fundValue);

    const sighash = tx.hashForWitnessV1(0, [utxoScript], [utxoValue], 0x00, claimLeafHash, undefined);
    const sig = claimKeyPair.signSchnorr(Buffer.from(sighash));

    tx.setWitness(0, [
      Buffer.from(sig),
      Buffer.from(preimage),
      Buffer.from(claimScript),
      Buffer.from(controlBlock)
    ]);

    return tx.toHex();
  }

  buildRefundTx(swapId: string, fundTxid: string, fundVout: number, fundValue: number, destinationAddress: string, feeSats: number): string {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    if (!swap.refundPrivKey || !swap.refundScriptHex || !swap.refundControlBlock) {
      throw new Error('Swap missing refund data');
    }

    const network = this.getNetwork(swap.network);
    const refundKeyPair = ECPair.fromWIF(swap.refundPrivKey, network);

    const refundScript = hexToBytes(swap.refundScriptHex);
    const controlBlock = hexToBytes(swap.refundControlBlock);

    const refundLeafHash = tapleafHash(refundScript);

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.setLocktime(swap.lockTime!);
    tx.addInput(Buffer.from(fundTxid, 'hex').reverse(), fundVout, 0xfffffffe);
    tx.addOutput(bitcoin.address.toOutputScript(destinationAddress, network), BigInt(fundValue - feeSats));

    const utxoScript = Buffer.from(bitcoin.address.toOutputScript(swap.htlcAddress!, network));
    const utxoValue = BigInt(fundValue);

    const sighash = tx.hashForWitnessV1(0, [utxoScript], [utxoValue], 0x00, refundLeafHash, undefined);
    const sig = refundKeyPair.signSchnorr(Buffer.from(sighash));

    tx.setWitness(0, [
      Buffer.from(sig),
      Buffer.from(refundScript),
      Buffer.from(controlBlock)
    ]);

    return tx.toHex();
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
    this.saveSwaps();
    return swap;
  }

  private saveSwaps() {
    const data = Array.from(this.swaps.values());
    localStorage.setItem('bip110-dex-swaps', JSON.stringify(data));
  }

  loadSwaps() {
    const raw = localStorage.getItem('bip110-dex-swaps');
    if (raw) {
      const data: SwapState[] = JSON.parse(raw);
      for (const s of data) {
        this.swaps.set(s.id, s);
      }
    }
  }
}
