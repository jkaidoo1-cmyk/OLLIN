"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Power, PowerOff, BarChart3, Key, AlertCircle } from "lucide-react";

interface ApiKeyEntry {
  id: string;
  key: string;
  label: string;
  provider: "groq" | "gemini";
  enabled: boolean;
  added_at: string;
  last_used_at: string | null;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
}

const STORAGE_KEY = "ollin_api_keys";
const PROVIDER_KEY = "ollin_ai_provider";

function loadKeys(): ApiKeyEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveKeys(keys: ApiKeyEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function AdminSettingsPage() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [provider, setProvider] = useState("groq");
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setKeys(loadKeys());
    setProvider(localStorage.getItem(PROVIDER_KEY) || "groq");
    setLoading(false);
  }, []);

  const handleAddKey = () => {
    if (!newKey.trim()) return;
    setAdding(true);
    setError("");

    try {
      const entry: ApiKeyEntry = {
        id: `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        key: newKey.trim(),
        label: newLabel.trim() || `Key ${keys.length + 1}`,
        provider: provider as "groq" | "gemini",
        enabled: true,
        added_at: new Date().toISOString(),
        last_used_at: null,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        estimated_cost_usd: 0,
      };
      const updated = [...keys, entry];
      saveKeys(updated);
      setKeys(updated);
      setNewKey("");
      setNewLabel("");
      setSuccess("Key added successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to add key");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveKey = (id: string) => {
    const updated = keys.filter((k) => k.id !== id);
    saveKeys(updated);
    setKeys(updated);
  };

  const handleToggleKey = (id: string) => {
    const updated = keys.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k));
    saveKeys(updated);
    setKeys(updated);
  };

  const handleProviderChange = (p: string) => {
    setProvider(p);
    localStorage.setItem(PROVIDER_KEY, p);
  };

  const totalRequests = keys.reduce((s, k) => s + k.total_requests, 0);
  const totalInputTokens = keys.reduce((s, k) => s + k.total_input_tokens, 0);
  const totalOutputTokens = keys.reduce((s, k) => s + k.total_output_tokens, 0);
  const totalCost = keys.reduce((s, k) => s + k.estimated_cost_usd, 0);

  return (
    <div>
      <h1 className="text-xl font-bold text-[#333] mb-6">Settings</h1>

      <div className="space-y-6">
        {/* ── API Keys Section ────────────────────── */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#333]">API Keys</h2>
              <p className="text-sm text-[#666] mt-0.5">
                Add multiple keys. When one runs out, the system automatically uses the next.
              </p>
            </div>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="input-field w-full sm:w-auto text-sm"
            >
              <option value="groq">Groq</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {/* Add new key */}
          <div className="space-y-2 mb-4">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Main key)"
              className="input-field text-sm"
            />
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="API key (gsk_...)"
              className="input-field text-sm"
            />
            <button onClick={handleAddKey} disabled={adding || !newKey.trim()} className="btn-primary w-full text-sm">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add key</>}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-600 text-xs rounded-lg mb-4">
              {success}
            </div>
          )}

          {/* Keys list */}
          {loading ? (
            <div className="py-8 text-center text-sm text-[#999]">Loading...</div>
          ) : keys.length === 0 ? (
            <div className="py-8 text-center">
              <Key className="w-8 h-8 text-[#ccc] mx-auto mb-2" />
              <p className="text-sm text-[#666]">No API keys configured yet.</p>
              <p className="text-xs text-[#999] mt-1">Add a key above to enable question generation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className={`border rounded-lg p-4 ${k.enabled ? "border-[#e0e0e0]" : "border-[#e0e0e0] opacity-60"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${k.enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#333]">{k.label}</p>
                        <p className="text-xs text-[#999]">{maskKey(k.key)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleKey(k.id)}
                        className={`p-1.5 rounded transition-colors ${k.enabled ? "text-green-600 hover:bg-green-50" : "text-[#999] hover:bg-gray-100"}`}
                        title={k.enabled ? "Disable" : "Enable"}
                      >
                        {k.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleRemoveKey(k.id)}
                        className="p-1.5 rounded text-[#999] hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#f8f8f8] rounded p-2">
                      <p className="text-[10px] text-[#999]">Requests</p>
                      <p className="text-sm font-semibold text-[#333]">{k.total_requests.toLocaleString()}</p>
                    </div>
                    <div className="bg-[#f8f8f8] rounded p-2">
                      <p className="text-[10px] text-[#999]">Input tokens</p>
                      <p className="text-sm font-semibold text-[#333]">{formatTokens(k.total_input_tokens)}</p>
                    </div>
                    <div className="bg-[#f8f8f8] rounded p-2">
                      <p className="text-[10px] text-[#999]">Output tokens</p>
                      <p className="text-sm font-semibold text-[#333]">{formatTokens(k.total_output_tokens)}</p>
                    </div>
                    <div className="bg-[#f8f8f8] rounded p-2">
                      <p className="text-[10px] text-[#999]">Est. cost</p>
                      <p className="text-sm font-semibold text-[#333]">${k.estimated_cost_usd.toFixed(4)}</p>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#999] mt-2">
                    Added {new Date(k.added_at).toLocaleDateString()}
                    {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleString()}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Totals Summary ────────────────────── */}
        {keys.length > 0 && (
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
            <h2 className="text-base font-semibold text-[#333] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Usage Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#333]">{keys.length}</p>
                <p className="text-xs text-[#999]">Total Keys</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#333]">{totalRequests.toLocaleString()}</p>
                <p className="text-xs text-[#999]">Total Requests</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#333]">{formatTokens(totalInputTokens + totalOutputTokens)}</p>
                <p className="text-xs text-[#999]">Total Tokens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#333]">${totalCost.toFixed(4)}</p>
                <p className="text-xs text-[#999]">Total Cost</p>
              </div>
            </div>

            {keys.length > 1 && (
              <div className="mt-6 space-y-3">
                <p className="text-xs font-semibold text-[#999] uppercase tracking-wider">Per-Key Usage</p>
                {keys.map((k) => {
                  const maxTokens = Math.max(...keys.map((x) => x.total_input_tokens + x.total_output_tokens), 1);
                  const total = k.total_input_tokens + k.total_output_tokens;
                  const pct = (total / maxTokens) * 100;
                  return (
                    <div key={k.id} className="flex items-center gap-3">
                      <span className="text-xs text-[#666] w-24 truncate">{k.label}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#999] w-16 text-right">{formatTokens(total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Platform Info ────────────────────── */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
          <h2 className="text-base font-semibold text-[#333] mb-4">Platform</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[#999]">Version</p>
              <p className="font-medium text-[#333]">1.0.0</p>
            </div>
            <div>
              <p className="text-[#999]">AI Provider</p>
              <p className="font-medium text-[#333] capitalize">{provider}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
