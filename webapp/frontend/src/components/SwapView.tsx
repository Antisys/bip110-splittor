import React from 'react';
import { SwapState } from '../lib/swapEngine';

interface SwapViewProps {
  swaps: SwapState[];
}

function formatSats(sats?: number): string {
  if (!sats) return '—';
  return (sats / 100000000).toFixed(8);
}

export function SwapView({ swaps }: SwapViewProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">My Swaps</h2>
      
      {swaps.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No active swaps. Accept an offer from the market to start.
        </div>
      ) : (
        <div className="grid gap-3">
          {swaps.map(swap => (
            <div
              key={swap.id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      swap.status === 'pending'
                        ? 'bg-yellow-900/50 text-yellow-300'
                        : swap.status === 'funded'
                        ? 'bg-blue-900/50 text-blue-300'
                        : swap.status === 'claimed'
                        ? 'bg-green-900/50 text-green-300'
                        : 'bg-red-900/50 text-red-300'
                    }`}
                  >
                    {swap.status.toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-400">
                    {swap.side === 'sell_b110' ? 'Selling B110' : 'Buying B110'}
                  </span>
                  {swap.network && (
                    <span className="text-xs text-slate-600">{swap.network}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">B110: </span>
                    <span className="font-mono">{formatSats(swap.b110Amount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">BTC: </span>
                    <span className="font-mono">{formatSats(swap.btcAmount)}</span>
                  </div>
                </div>

                {swap.htlcAddress && (
                  <div className="bg-slate-800 rounded-lg p-3 space-y-1">
                    <div className="text-xs text-green-400 font-medium">HTLC ADDRESS (send funds here)</div>
                    <div className="font-mono text-sm text-white break-all select-all">
                      {swap.htlcAddress}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                  {swap.preimage && (
                    <div>
                      <span>Preimage: </span>
                      <code className="font-mono break-all block mt-1 text-slate-400">{swap.preimage}</code>
                    </div>
                  )}
                  {swap.hashLock && (
                    <div>
                      <span>HashLock: </span>
                      <code className="font-mono break-all block mt-1 text-slate-400">{swap.hashLock}</code>
                    </div>
                  )}
                </div>

                {swap.lockTime && (
                  <div className="text-xs text-slate-600">
                    Locktime: {swap.lockTime} blocks
                  </div>
                )}

                <div className="text-xs text-slate-500">
                  Swap ID: <code className="font-mono">{swap.id}</code>
                </div>

                <div className="text-xs text-slate-600 border-t border-slate-800 pt-2">
                  Fund this swap by sending {formatSats(swap.side === 'sell_b110' ? swap.btcAmount : swap.b110Amount)} 
                  {swap.side === 'sell_b110' ? ' BTC' : ' B110'} to the HTLC address using your wallet.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
