import React from 'react';
import { SwapOffer } from '../lib/nostrClient';

interface MarketViewProps {
  offers: SwapOffer[];
  onAccept: (offer: SwapOffer) => void;
  onDelete: (eventId: string) => void;
}

export function MarketView({ offers, onAccept, onDelete }: MarketViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Market</h2>
        <span className="text-sm text-slate-400">{offers.length} offers available</span>
      </div>

      {offers.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No offers yet. Create one to start trading.
        </div>
      ) : (
        <div className="grid gap-3">
          {offers.map(offer => (
            <div
              key={offer.id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        offer.side === 'sell_b110'
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-green-900/50 text-green-300'
                      }`}
                    >
                      {offer.side === 'sell_b110' ? 'SELL B110' : 'BUY B110'}
                    </span>
                    <span className="text-sm text-slate-400">{offer.network}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">B110:</span>{' '}
                      <span className="font-mono">{(offer.b110Amount / 100000000).toFixed(8)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">BTC:</span>{' '}
                      <span className="font-mono">{(offer.btcAmount / 100000000).toFixed(8)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">
                    Premium: {offer.premiumPct > 0 ? '+' : ''}{offer.premiumPct.toFixed(1)}%
                    {' · '}
                    Deadline: {offer.htlcDeadline} blocks
                    {' · '}
                    {new Date(offer.createdAt * 1000).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onAccept(offer)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onDelete(offer.id)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
