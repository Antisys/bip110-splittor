import React, { useState } from 'react';

interface RpcConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

interface AppConfig {
  relays: string[];
  b110Rpc: RpcConfig;
  mainRpc: RpcConfig;
}

interface SettingsProps {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
}

export function Settings({ config, onChange }: SettingsProps) {
  const [relays, setRelays] = useState(config.relays.join('\n'));
  const [b110, setB110] = useState(config.b110Rpc);
  const [main, setMain] = useState(config.mainRpc);

  const handleSave = () => {
    onChange({
      ...config,
      relays: relays.split('\n').map(r => r.trim()).filter(Boolean),
      b110Rpc: b110,
      mainRpc: main
    });
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">Nostr Relays</label>
          <textarea
            value={relays}
            onChange={(e) => setRelays(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
            placeholder="wss://damus.io"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">BIP110 RPC</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={b110.host}
              onChange={(e) => setB110({ ...b110, host: e.target.value })}
              placeholder="Host"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
            <input
              value={b110.port}
              onChange={(e) => setB110({ ...b110, port: parseInt(e.target.value) || 0 })}
              placeholder="Port"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
            <input
              value={b110.user}
              onChange={(e) => setB110({ ...b110, user: e.target.value })}
              placeholder="User"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
            <input
              type="password"
              value={b110.pass}
              onChange={(e) => setB110({ ...b110, pass: e.target.value })}
              placeholder="Password"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Mainnet RPC</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={main.host}
              onChange={(e) => setMain({ ...main, host: e.target.value })}
              placeholder="Host"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
            <input
              value={main.port}
              onChange={(e) => setMain({ ...main, port: parseInt(e.target.value) || 0 })}
              placeholder="Port"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
            <input
              value={main.user}
              onChange={(e) => setMain({ ...main, user: e.target.value })}
              placeholder="User"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
            <input
              type="password"
              value={main.pass}
              onChange={(e) => setMain({ ...main, pass: e.target.value })}
              placeholder="Password"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-600"
            />
          </div>
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
