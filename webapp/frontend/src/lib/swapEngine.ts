import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const MIN_LOCKTIME_OFFSET_BLOCKS = 288;

export interface SwapState {
  id: string;
  offerId: string;
  side: 'sell_b110' | 'buy_b110';
  status: 'pending' | 'funded' | 'claimed' | 'refunded';
  htlcAddress?: string;
  fundTxid?: string;
  fundVout?: number;
  claimTxid?: string;
  refundTxid?: string;
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
  controlBlock?: string;
  claimControlBlock?: string;
  refundControlBlock?: string;
  claimScriptHex?: string;
  refundScriptHex?: string;
  createdAt: number;
}

export interface InputInfo {
  txid: string;
  vout: number;
  value: number;
}

export interface OutputInfo {
  address: string;
  value: number;
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

  private computeTapleafHash(script: Buffer): Buffer {
    const prefix = Buffer.concat([
      Buffer.from([0xc0]),
      Buffer.from([script.length]),
      script
    ]);
    return Buffer.from(bitcoin.crypto.taggedHash('TapLeaf', prefix));
  }

  createHtlcAddress(hashLockHex: string, claimPubKey: Buffer, refundPubKey: Buffer, lockTime: number, network: bitcoin.Network): {
    address: string;
    claimControlBlock: string;
    refundControlBlock: string;
    claimScriptHex: string;
    refundScriptHex: string;
  } {
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

    const claimLeafHash = this.computeTapleafHash(claimScript);
    const refundLeafHash = this.computeTapleafHash(refundScript);

    const claimControlBlock = Buffer.concat([internalKey, Buffer.from([0xc0]), refundLeafHash]);
    const refundControlBlock = Buffer.concat([internalKey, Buffer.from([0xc0]), claimLeafHash]);

    return {
      address: payment.address!,
      claimControlBlock: claimControlBlock.toString('hex'),
      refundControlBlock: refundControlBlock.toString('hex'),
      claimScriptHex: claimScript.toString('hex'),
      refundScriptHex: refundScript.toString('hex')
    };
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

  buildClaimPsbt(swapId: string, inputs: InputInfo[], outputs: OutputInfo[]): string {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    if (!swap.preimage || !swap.claimPrivKey || !swap.claimScriptHex || !swap.claimControlBlock) {
      throw new Error('Swap missing claim data');
    }

    const network = this.getNetwork(swap.network);
    const claimKeyPair = ECPair.fromWIF(swap.claimPrivKey, network);
    const claimScript = Buffer.from(swap.claimScriptHex, 'hex');
    const controlBlock = Buffer.from(swap.claimControlBlock, 'hex');
    const preimage = Buffer.from(swap.preimage, 'hex');

    const psbt = new bitcoin.Psbt({ network });

    for (const input of inputs) {
      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: Buffer.from(bitcoin.address.toOutputScript(swap.htlcAddress!, network)),
          value: input.value
        },
        tapScriptSig: [{
          pubkey: claimKeyPair.publicKey.subarray(1, 33),
          hash: bitcoin.crypto.hash160(claimScript)
        }]
      });
    }

    for (const output of outputs) {
      psbt.addOutput({
        address: output.address,
        value: output.value
      });
    }

    psbt.signAllInputs(claimKeyPair);

    const claimWitness = Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from([preimage.length]),
      preimage,
      claimScript,
      controlBlock
    ]);

    for (let i = 0; i < inputs.length; i++) {
      psbt.updateInput(i, {
        finalScriptWitness: [claimWitness]
      });
    }

    return psbt.toBase64();
  }

  buildRefundPsbt(swapId: string, inputs: InputInfo[], outputs: OutputInfo[]): string {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    if (!swap.refundPrivKey || !swap.refundScriptHex || !swap.refundControlBlock) {
      throw new Error('Swap missing refund data');
    }

    const network = this.getNetwork(swap.network);
    const refundKeyPair = ECPair.fromWIF(swap.refundPrivKey, network);
    const refundScript = Buffer.from(swap.refundScriptHex, 'hex');
    const controlBlock = Buffer.from(swap.refundControlBlock, 'hex');

    const psbt = new bitcoin.Psbt({ network });

    psbt.setLocktime(swap.lockTime!);

    for (const input of inputs) {
      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        sequence: 0xfffffffe,
        witnessUtxo: {
          script: Buffer.from(bitcoin.address.toOutputScript(swap.htlcAddress!, network)),
          value: input.value
        },
        tapScriptSig: [{
          pubkey: refundKeyPair.publicKey.subarray(1, 33),
          hash: bitcoin.crypto.hash160(refundScript)
        }]
      });
    }

    for (const output of outputs) {
      psbt.addOutput({
        address: output.address,
        value: output.value
      });
    }

    psbt.signAllInputs(refundKeyPair);

    const refundWitness = Buffer.concat([
      Buffer.from([0x00]),
      refundScript,
      controlBlock
    ]);

    for (let i = 0; i < inputs.length; i++) {
      psbt.updateInput(i, {
        finalScriptWitness: [refundWitness]
      });
    }

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
