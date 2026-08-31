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

function pushDataLen(len: number): Uint8Array {
  if (len < 0x4c) return new Uint8Array([len]);
  if (len < 0x100) return new Uint8Array([0x4c, len]);
  return new Uint8Array([0x4d, len & 0xff, (len >> 8) & 0xff]);
}

export class SwapEngine {
  private swaps: Map<string, SwapState> = new Map();

  generatePreimage(): { preimage: string; hashLock: string } {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const preimage = bytesToHex(bytes);
    const hashBytes = crypto.getRandomValues(new Uint8Array(32));
    const hashLock = bytesToHex(hashBytes);
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
      pushDataLen(32),
      hashLock,
      new Uint8Array([0x88]),
      pushDataLen(32),
      xOnlyClaim,
      new Uint8Array([0xac])
    );

    const locktimeBytes: Uint8Array[] = [];
    if (lockTime < 0x100) {
      locktimeBytes.push(new Uint8Array([lockTime]));
    } else {
      locktimeBytes.push(new Uint8Array([lockTime & 0xff, (lockTime >> 8) & 0xff]));
    }
    const refundScript = concatBytes(
      ...locktimeBytes,
      new Uint8Array([0xb1]),
      new Uint8Array([0x75]),
      pushDataLen(32),
      xOnlyRefund,
      new Uint8Array([0xac])
    );

    const claimLeafHash = this.tapleafHash(claimScript);
    const refundLeafHash = this.tapleafHash(refundScript);

    const claimControlBlock = concatBytes(xOnlyClaim, new Uint8Array([0xc0]), refundLeafHash);
    const refundControlBlock = concatBytes(xOnlyClaim, new Uint8Array([0xc0]), claimLeafHash);

    const claimLeaf = { output: claimScript };
    const refundLeaf = { output: refundScript };

    const payment = bitcoin.payments.p2tr({
      internalPubkey: Buffer.from(xOnlyClaim),
      scriptTree: [claimLeaf, refundLeaf],
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

  private tapleafHash(script: Uint8Array): Uint8Array {
    const prefix = concatBytes(
      new Uint8Array([0xc0]),
      new Uint8Array([script.length]),
      script
    );
    const hash = bitcoin.crypto.taggedHash('TapLeaf', Buffer.from(prefix));
    return new Uint8Array(hash);
  }

  initiateSwap(offerId: string, side: 'sell_b110' | 'buy_b110', amounts?: { btc: number; b110: number; network: string }): SwapState {
    const id = this.createSwapId();
    const { preimage, hashLock } = this.generatePreimage();
    const network = this.getNetwork(amounts?.network);
    const lockTime = 144;

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

  buildClaimPsbt(swapId: string, fundTxid: string, fundVout: number, fundValue: number, destinationAddress: string, feeSats: number): string {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    if (!swap.preimage || !swap.claimPrivKey || !swap.claimScriptHex || !swap.claimControlBlock) {
      throw new Error('Swap missing claim data');
    }

    const network = this.getNetwork(swap.network);
    const claimKeyPair = ECPair.fromWIF(swap.claimPrivKey, network);

    const psbt = new bitcoin.Psbt({ network });

    psbt.addInput({
      hash: fundTxid,
      index: fundVout,
      witnessUtxo: {
        script: Buffer.from(bitcoin.address.toOutputScript(swap.htlcAddress!, network)),
        value: fundValue
      }
    });

    psbt.addOutput({
      address: destinationAddress,
      value: fundValue - feeSats
    });

    psbt.signInput(0, claimKeyPair);

    const preimageBytes = hexToBytes(swap.preimage);
    const claimScriptBytes = hexToBytes(swap.claimScriptHex);
    const controlBlockBytes = hexToBytes(swap.claimControlBlock);

    const witness = [
      Buffer.from([]),
      Buffer.from(preimageBytes),
      Buffer.from(claimScriptBytes),
      Buffer.from(controlBlockBytes)
    ];

    psbt.updateInput(0, { finalScriptWitness: witness });

    return psbt.toBase64();
  }

  buildRefundPsbt(swapId: string, fundTxid: string, fundVout: number, fundValue: number, destinationAddress: string, feeSats: number): string {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    if (!swap.refundPrivKey || !swap.refundScriptHex || !swap.refundControlBlock) {
      throw new Error('Swap missing refund data');
    }

    const network = this.getNetwork(swap.network);
    const refundKeyPair = ECPair.fromWIF(swap.refundPrivKey, network);

    const psbt = new bitcoin.Psbt({ network });
    psbt.setLocktime(swap.lockTime!);

    psbt.addInput({
      hash: fundTxid,
      index: fundVout,
      sequence: 0xfffffffe,
      witnessUtxo: {
        script: Buffer.from(bitcoin.address.toOutputScript(swap.htlcAddress!, network)),
        value: fundValue
      }
    });

    psbt.addOutput({
      address: destinationAddress,
      value: fundValue - feeSats
    });

    psbt.signInput(0, refundKeyPair);

    const refundScriptBytes = hexToBytes(swap.refundScriptHex);
    const controlBlockBytes = hexToBytes(swap.refundControlBlock);

    const witness = [
      Buffer.from([]),
      Buffer.from(refundScriptBytes),
      Buffer.from(controlBlockBytes)
    ];

    psbt.updateInput(0, { finalScriptWitness: witness });

    return psbt.toBase64();
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
