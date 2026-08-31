import React, { useState } from 'react';

interface AppConfig {
  relays: string[];
}

interface SettingsProps {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
  pubkey: string;
}

export function Settings({ config, onChange, pubkey }: SettingsProps) {
  const [relays, setRelays] = useState(config.relays.join('\n'));

  const handleSave = () => {
    onChange({
      relays: relays.split('\n').map(r => r.trim()).filter(Boolean)
    });
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">Your Nostr Public Key</label>
          <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-300 break-all select-all">
            {pubkey || 'Not connected'}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Nostr Relays</label>
          <textarea
            value={relays}
            onChange={(e) => setRelays(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
            placeholder="wss://relay.damus.io"
          />
        </div>

        <button
          onClick={handleSave}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
}
