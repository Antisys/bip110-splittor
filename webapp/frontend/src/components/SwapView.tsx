import React from 'react';
import { SwapState } from '../lib/swapEngine';

interface SwapViewProps {
  swaps: SwapState[];
  onFund?: (swapId: string) => void;
  onClaim?: (swapId: string) => void;
  onRefund?: (swapId: string) => void;
}

export function SwapView({ swaps, onFund, onClaim, onRefund }: SwapViewProps) {
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
              <div className="flex items-start justify-between">
                <div className="space-y-2">
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
                  </div>

                  {swap.preimage && (
                    <div className="text-xs text-slate-500">
                      <span>Preimage: </span>
                      <code className="font-mono bg-slate-800 px-1 rounded">
                        {swap.preimage.slice(0, 16)}...
                      </code>
                    </div>
                  )}

                  {swap.htlcAddress && (
                    <div className="text-xs text-slate-500">
                      <span>HTLC Address: </span>
                      <code className="font-mono bg-slate-800 px-1 rounded">
                        {swap.htlcAddress}
                      </code>
                    </div>
                  )}

                  <div className="text-xs text-slate-500">
                    Swap ID: <code className="font-mono">{swap.id.slice(0, 16)}</code>
                  </div>
                </div>

                <div className="flex gap-2">
                  {swap.status === 'pending' && onFund && (
                    <button
                      onClick={() => onFund(swap.id)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
                    >
                      Fund
                    </button>
                  )}
                  {swap.status === 'funded' && onClaim && (
                    <button
                      onClick={() => onClaim(swap.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors"
                    >
                      Claim
                    </button>
                  )}
                  {swap.status === 'funded' && onRefund && (
                    <button
                      onClick={() => onRefund(swap.id)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm font-medium transition-colors"
                    >
                      Refund
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
