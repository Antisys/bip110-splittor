import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

interface RpcConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

interface SwapState {
  id: string;
  offerId: string;
  side: 'sell_b110' | 'buy_b110';
  status: 'pending' | 'funded' | 'claimed' | 'refunded';
  htlcAddress?: string;
  fundTxid?: string;
  claimTxid?: string;
  preimage?: string;
  hashLock?: Buffer;
  createdAt: number;
}

export class SwapEngine {
  private b110Rpc: RpcConfig;
  private mainRpc: RpcConfig;
  private swaps: Map<string, SwapState> = new Map();

  constructor(b110Rpc: RpcConfig, mainRpc: RpcConfig) {
    this.b110Rpc = b110Rpc;
    this.mainRpc = mainRpc;
  }

  async rpcCall(config: RpcConfig, method: string, params: any[] = []): Promise<any> {
    const response = await fetch(`http://${config.host}:${config.port}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${config.user}:${config.pass}`)
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: Date.now(),
        method,
        params
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async getBalance(chain: 'b110' | 'main'): Promise<number> {
    const config = chain === 'b110' ? this.b110Rpc : this.mainRpc;
    const result = await this.rpcCall(config, 'getbalance');
    return result;
  }

  async getNewAddress(chain: 'b110' | 'main'): Promise<string> {
    const config = chain === 'b110' ? this.b110Rpc : this.mainRpc;
    return await this.rpcCall(config, 'getnewaddress');
  }

  async getBlockCount(chain: 'b110' | 'main'): Promise<number> {
    const config = chain === 'b110' ? this.b110Rpc : this.mainRpc;
    return await this.rpcCall(config, 'getblockcount');
  }

  createKeyPair(): any {
    return ECPair.makeRandom({ network: bitcoin.networks.regtest });
  }

  computeHashLock(preimage: string): Buffer {
    return Buffer.from(bitcoin.crypto.sha256(Buffer.from(preimage, 'utf8')));
  }

  generatePreimage(): { preimage: string; hashLock: Buffer } {
    const preimage = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return { preimage, hashLock: this.computeHashLock(preimage) };
  }

  createSwapId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  initiateSwap(offerId: string, side: 'sell_b110' | 'buy_b110'): SwapState {
    const id = this.createSwapId();
    const { preimage, hashLock } = this.generatePreimage();
    
    const swap: SwapState = {
      id,
      offerId,
      side,
      status: 'pending',
      preimage,
      hashLock,
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

  async fundSwap(swapId: string, amount: number): Promise<string> {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');

    const chain = swap.side === 'sell_b110' ? 'b110' : 'main';
    const config = chain === 'b110' ? this.b110Rpc : this.mainRpc;

    const address = await this.getNewAddress(chain);
    const txid = await this.rpcCall(config, 'sendtoaddress', [address, amount / 100000000]);

    swap.htlcAddress = address;
    swap.fundTxid = txid;
    swap.status = 'funded';
    
    return txid;
  }

  async claimSwap(swapId: string): Promise<string> {
    const swap = this.swaps.get(swapId);
    if (!swap || !swap.preimage) throw new Error('Swap not ready for claiming');

    const chain = swap.side === 'sell_b110' ? 'main' : 'b110';
    const config = chain === 'b110' ? this.b110Rpc : this.mainRpc;

    const address = await this.getNewAddress(chain);
    swap.claimTxid = address;
    swap.status = 'claimed';

    return swap.claimTxid;
  }

  async refundSwap(swapId: string): Promise<string> {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');

    const chain = swap.side === 'sell_b110' ? 'b110' : 'main';
    const config = chain === 'b110' ? this.b110Rpc : this.mainRpc;

    const address = await this.getNewAddress(chain);
    swap.status = 'refunded';

    return address;
  }
}
