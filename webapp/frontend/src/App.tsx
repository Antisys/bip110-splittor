import React, { useState, useEffect, useCallback } from 'react';
import { NostrClient, SwapOffer } from './lib/nostrClient';
import { SwapEngine, SwapState } from './lib/swapEngine';
import { MarketView } from './components/MarketView';
import { CreateOffer } from './components/CreateOffer';
import { SwapView } from './components/SwapView';
import { Settings } from './components/Settings';

type Tab = 'market' | 'create' | 'swaps' | 'settings';

interface AppConfig {
  relays: string[];
}

const defaultConfig: AppConfig = {
  relays: ['wss://nos.lol', 'wss://relay.damus.io']
};

export default function App() {
  const [tab, setTab] = useState<Tab>('market');
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('bip110-dex-config');
    return saved ? JSON.parse(saved) : defaultConfig;
  });
  const [client, setClient] = useState<NostrClient | null>(null);
  const [engine, setEngine] = useState<SwapEngine | null>(null);
  const [offers, setOffers] = useState<SwapOffer[]>([]);
  const [swaps, setSwaps] = useState<SwapState[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    localStorage.setItem('bip110-dex-config', JSON.stringify(config));
  }, [config]);

  const initClient = useCallback(async () => {
    const c = new NostrClient(config.relays);
    await c.connect();
    setClient(c);
    setConnected(true);

    c.onOffer((offer) => {
      setOffers(prev => {
        const exists = prev.find(o => o.id === offer.id);
        if (exists) return prev;
        return [...prev, offer].sort((a, b) => b.createdAt - a.createdAt);
      });
    });

    c.subscribeOffers();
  }, [config.relays]);

  const initEngine = useCallback(() => {
    const e = new SwapEngine();
    setEngine(e);
  }, []);

  useEffect(() => {
    initClient();
    initEngine();
  }, [initClient, initEngine]);

  const publishOffer = async (offer: Omit<SwapOffer, 'id' | 'pubkey' | 'createdAt' | 'sig'>) => {
    if (!client) return;
    const id = await client.publishOffer(offer);
    const localOffer: SwapOffer = {
      ...offer,
      id,
      pubkey: client.getPubkey(),
      createdAt: Math.floor(Date.now() / 1000)
    };
    setOffers(prev => [localOffer, ...prev]);
  };

  const deleteOffer = async (eventId: string) => {
    if (!client) return;
    await client.deleteOffer(eventId);
    setOffers(prev => prev.filter(o => o.id !== eventId));
  };

  const acceptOffer = async (offer: SwapOffer) => {
    if (!engine) return;
    const swap = engine.initiateSwap(offer.id, offer.side, {
      btc: offer.btcAmount,
      b110: offer.b110Amount,
      network: offer.network
    });
    setSwaps(prev => [swap, ...prev]);
    setTab('swaps');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">BIP-110 DEX</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-slate-500">Relay: </span>
              <span className={connected ? 'text-green-400' : 'text-red-400'}>
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {client?.getPubkey() && (
              <div className="text-xs text-slate-500 font-mono">
                {client.getPubkey().slice(0, 8)}...{client.getPubkey().slice(-4)}
              </div>
            )}
            <span className="text-sm text-slate-400">{offers.length} offers</span>
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex gap-1 p-2">
          {(['market', 'create', 'swaps', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {t === 'market' && 'Market'}
              {t === 'create' && 'Create Offer'}
              {t === 'swaps' && 'My Swaps'}
              {t === 'settings' && 'Settings'}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4">
        {tab === 'market' && (
          <MarketView
            offers={offers}
            onAccept={acceptOffer}
            onDelete={deleteOffer}
          />
        )}
        {tab === 'create' && (
          <CreateOffer onPublish={publishOffer} />
        )}
        {tab === 'swaps' && (
          <SwapView swaps={swaps} />
        )}
        {tab === 'settings' && (
          <Settings config={config} onChange={setConfig} pubkey={client?.getPubkey() || ''} />
        )}
      </main>
    </div>
  );
}
