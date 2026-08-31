import React, { useState } from 'react';
import { SwapState } from '../lib/swapEngine';

interface SwapViewProps {
  swaps: SwapState[];
}

function formatSats(sats?: number): string {
  if (!sats) return '—';
  return (sats / 100000000).toFixed(8);
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SwapView({ swaps }: SwapViewProps) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

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
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3"
            >
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
                  <div className="text-xs text-green-400 font-medium">HTLC ADDRESS — fund this with your wallet</div>
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

              <div className="text-xs text-slate-600">
                Swap ID: <code className="font-mono">{swap.id}</code>
              </div>

              {swap.claimPrivKey && (
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <button
                    onClick={() => setShowKeys(prev => ({ ...prev, [swap.id]: !prev[swap.id] }))}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    {showKeys[swap.id] ? 'Hide' : 'Show'} Private Keys
                  </button>

                  {showKeys[swap.id] && (
                    <div className="space-y-2 text-xs">
                      <div className="bg-slate-800 rounded p-2">
                        <div className="text-green-400 font-medium mb-1">Claim Key (whoever knows preimage)</div>
                        <code className="font-mono break-all text-slate-300">{swap.claimPrivKey}</code>
                      </div>
                      <div className="bg-slate-800 rounded p-2">
                        <div className="text-yellow-400 font-medium mb-1">Refund Key (you, after locktime)</div>
                        <code className="font-mono break-all text-slate-300">{swap.refundPrivKey}</code>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
