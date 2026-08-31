import React, { useState } from 'react';
import { SwapOffer } from '../lib/nostrClient';

interface CreateOfferProps {
  onPublish: (offer: Omit<SwapOffer, 'id' | 'pubkey' | 'createdAt' | 'sig'>) => Promise<void>;
}

export function CreateOffer({ onPublish }: CreateOfferProps) {
  const [side, setSide] = useState<'sell_b110' | 'buy_b110'>('sell_b110');
  const [b110Amount, setB110Amount] = useState('');
  const [btcAmount, setBtcAmount] = useState('');
  const [premiumPct, setPremiumPct] = useState('0');
  const [htlcDeadline, setHtlcDeadline] = useState('144');
  const [network, setNetwork] = useState<'regtest' | 'mainnet'>('regtest');
  const [publishing, setPublishing] = useState(false);

  const premium = parseFloat(premiumPct) || 0;
  const baseAmount = side === 'sell_b110'
    ? parseFloat(b110Amount) || 0
    : parseFloat(btcAmount) || 0;
  const adjustedAmount = baseAmount * (1 + premium / 100);

  const handlePublish = async () => {
    if (!b110Amount || !btcAmount) return;
    setPublishing(true);
    try {
      await onPublish({
        side,
        b110Amount: Math.round(parseFloat(b110Amount) * 100000000),
        btcAmount: Math.round(parseFloat(btcAmount) * 100000000),
        premiumPct: premium,
        htlcDeadline: parseInt(htlcDeadline) || 144,
        network
      });
      setB110Amount('');
      setBtcAmount('');
      setPremiumPct('0');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Create Offer</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">Side</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide('sell_b110')}
              className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                side === 'sell_b110'
                  ? 'bg-red-900/50 border-red-700 text-red-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Sell B110
            </button>
            <button
              onClick={() => setSide('buy_b110')}
              className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                side === 'buy_b110'
                  ? 'bg-green-900/50 border-green-700 text-green-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Buy B110
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">B110 Amount</label>
          <input
            type="number"
            step="0.00000001"
            value={b110Amount}
            onChange={(e) => setB110Amount(e.target.value)}
            placeholder="0.00000000"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">BTC Amount</label>
          <input
            type="number"
            step="0.00000001"
            value={btcAmount}
            onChange={(e) => setBtcAmount(e.target.value)}
            placeholder="0.00000000"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Premium %</label>
            <input
              type="number"
              step="0.1"
              value={premiumPct}
              onChange={(e) => setPremiumPct(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">HTLC Deadline</label>
            <input
              type="number"
              value={htlcDeadline}
              onChange={(e) => setHtlcDeadline(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Network</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setNetwork('regtest')}
              className={`p-2 rounded-lg border text-sm transition-colors ${
                network === 'regtest'
                  ? 'bg-slate-800 border-slate-600'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Regtest
            </button>
            <button
              onClick={() => setNetwork('mainnet')}
              className={`p-2 rounded-lg border text-sm transition-colors ${
                network === 'mainnet'
                  ? 'bg-slate-800 border-slate-600'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              Mainnet
            </button>
          </div>
        </div>

        <button
          onClick={handlePublish}
          disabled={!b110Amount || !btcAmount || publishing}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg font-medium transition-colors"
        >
          {publishing ? 'Publishing...' : 'Publish Offer'}
        </button>
      </div>
    </div>
  );
}
