"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Power, PowerOff, Key, AlertCircle, Info, XCircle } from "lucide-react";

interface ApiKeyEntry {
  id: string;
  key: string;
  key_preview: string;
  label: string;
  provider: "groq" | "gemini";
  enabled: boolean;
  source: "env" | "file";
  added_at: string | null;
  last_used_at: string | null;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  last_error: string | null;
  last_error_at: string | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function AdminSettingsPage() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newProvider, setNewProvider] = useState("groq");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [source, setSource] = useState<"env" | "file">("file");
  const [hint, setHint] = useState("");

  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setKeys(data.api_keys || []);
      setSource(data.source || "file");
      setHint(data.hint || "");
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          key: newKey.trim(),
          label: `Key ${keys.length + 1}`,
          provider: newProvider,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKey("");
        setSuccess("Key added successfully");
        await fetchKeys();
      } else {
        setError(data.error || "Failed to add key");
      }
    } catch {
      setError("Failed to add key");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveKey = async (id: string) => {
    if (!confirm("Remove this API key?")) return;
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      await fetchKeys();
    } catch { /* ignore */ }
  };

  const handleToggleKey = async (id: string, enabled: boolean) => {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id, enabled }),
      });
      await fetchKeys();
    } catch { /* ignore */ }
  };

  const handleClearError = async (id: string) => {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_error", id }),
      });
      await fetchKeys();
    } catch { /* ignore */ }
  };

  // Determine key statuses
  const enabledKeys = keys.filter((k) => k.enabled);
  const activeKeyId = enabledKeys.length > 0
    ? enabledKeys.reduce((min, k) => k.total_requests < min.total_requests ? k : min, enabledKeys[0]).id
    : null;

  const isExhausted = (k: ApiKeyEntry) => {
    if (!k.last_error) return false;
    const msg = k.last_error.toLowerCase();
    return msg.includes("quota") || msg.includes("insufficient") ||
           msg.includes("billing") || msg.includes("limit") || msg.includes("rate");
  };

  // Aggregate stats
  const totalKeys = keys.length;
  const totalRequests = keys.reduce((s, k) => s + k.total_requests, 0);
  const totalTokens = keys.reduce((s, k) => s + k.total_input_tokens + k.total_output_tokens, 0);
  const totalCost = keys.reduce((s, k) => s + k.estimated_cost_usd, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[#999]" /></div>;
  }

  return (
    <div className="pb-24 max-w-2xl">
      <h1 className="text-xl font-bold text-[#333] mb-6">Settings</h1>

      {/* Source indicator */}
      {source === "env" ? (
        <div className="text-xs px-4 py-3 rounded-lg mb-6 flex items-start gap-2 bg-green-50 border border-green-200 text-green-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Keys are loaded from Vercel Environment Variables. They work from any device.</span>
        </div>
      ) : (
        <div className="text-xs px-4 py-3 rounded-lg mb-6 bg-amber-50 border border-amber-200 text-amber-700">
          <div className="flex items-start gap-2 mb-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="font-medium">Keys added here only work on this server.</span>
          </div>
          <p className="ml-6 mb-2">To make keys work from any device, add them as Vercel Environment Variables:</p>
          <ol className="ml-6 space-y-1 list-decimal">
            <li>Go to <a href="https://vercel.com/dashboard" target="_blank" className="underline">Vercel Dashboard</a> → your OLLIN project</li>
            <li>Go to <strong>Settings</strong> → <strong>Environment Variables</strong></li>
            <li>Add: Name = <code className="bg-amber-100 px-1 rounded">GROQ_API_KEY</code>, Value = your key</li>
            <li>Click Save, then redeploy</li>
          </ol>
          <p className="ml-6 mt-2 text-amber-600">For multiple keys with auto-fallback, use <code className="bg-amber-100 px-1 rounded">GROQ_API_KEYS</code> (comma-separated).</p>
        </div>
      )}

      {/* API Keys section */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#333] flex items-center gap-2">
            <Key className="w-4 h-4" /> API Keys
          </h2>
          {source === "env" && (
            <span className="text-[10px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
              ENV VARS
            </span>
          )}
        </div>

        <p className="text-xs text-[#999] mb-4">
          Add multiple keys. When one runs out, the system automatically uses the next.
          {source === "env" && " Keys from environment variables are read-only."}
        </p>

        {error && (
          <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
        {success && (
          <div className="text-xs px-3 py-2 bg-green-50 border border-green-200 text-green-600 rounded mb-4">
            {success}
          </div>
        )}

        {/* Legend */}
        {keys.length > 1 && (
          <div className="flex items-center gap-4 mb-3 text-[10px] text-[#999]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Exhausted
            </span>
          </div>
        )}

        {/* Key list */}
        <div className="space-y-3 mb-4">
          {keys.length === 0 ? (
            <div className="text-center py-6 text-sm text-[#999]">
              <Key className="w-8 h-8 mx-auto mb-2 text-[#ccc]" />
              <p>No API keys configured.</p>
              <p className="text-xs mt-1">Add a key below (works locally) or set GROQ_API_KEY in Vercel Environment Variables (works everywhere).</p>
            </div>
          ) : (
            keys.map((k) => {
              const active = k.id === activeKeyId;
              const exhausted = isExhausted(k);
              const borderColor = !k.enabled ? "border-[#e0e0e0]"
                : active ? "border-green-300"
                : exhausted ? "border-blue-300"
                : "border-[#e0e0e0]";
              return (
              <div key={k.id} className={`border rounded-lg p-3 ${borderColor} ${!k.enabled ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#333]">{k.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-[#666] uppercase">{k.provider}</span>
                    {k.source === "env" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-100">env</span>
                    )}
                    {k.enabled && active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    )}
                    {k.enabled && exhausted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Exhausted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {k.source === "file" && (
                      <>
                        <button
                          onClick={() => handleToggleKey(k.id, !k.enabled)}
                          className="p-1 hover:bg-[#f0f0f0] rounded"
                          title={k.enabled ? "Disable" : "Enable"}
                        >
                          {k.enabled
                            ? <Power className="w-3.5 h-3.5 text-green-600" />
                            : <PowerOff className="w-3.5 h-3.5 text-[#999]" />
                          }
                        </button>
                        <button
                          onClick={() => handleRemoveKey(k.id)}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-[#999] font-mono mb-2">{k.key_preview}</div>
                {k.last_error && (
                  <div className="text-[11px] px-2.5 py-1.5 bg-red-50 border border-red-200 rounded mb-2 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-red-600 font-medium">Inaccessible</p>
                      <p className="text-red-500 text-[10px] truncate">{k.last_error}</p>
                      {k.last_error_at && (
                        <p className="text-red-400 text-[10px] mt-0.5">
                          {new Date(k.last_error_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleClearError(k.id)}
                      className="text-red-400 hover:text-red-600 p-0.5"
                      title="Dismiss"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <div>
                    <div className="text-[#999]">Requests</div>
                    <div className="font-medium text-[#333]">{k.total_requests}</div>
                  </div>
                  <div>
                    <div className="text-[#999]">Input tokens</div>
                    <div className="font-medium text-[#333]">{formatTokens(k.total_input_tokens)}</div>
                  </div>
                  <div>
                    <div className="text-[#999]">Output tokens</div>
                    <div className="font-medium text-[#333]">{formatTokens(k.total_output_tokens)}</div>
                  </div>
                  <div>
                    <div className="text-[#999]">Est. cost</div>
                    <div className="font-medium text-[#333]">${k.estimated_cost_usd.toFixed(4)}</div>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Add new key form */}
        <div className="border-t border-[#e0e0e0] pt-4">
          <h3 className="text-xs font-medium text-[#666] mb-2">Add API key</h3>
          <div className="flex gap-2 items-center">
            <select
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              className="text-xs border border-[#ccc] rounded px-2 py-2 bg-white text-[#333]"
            >
              <option value="groq">Groq</option>
              <option value="gemini">Google Gemini</option>
            </select>
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Paste your API key here"
              className="flex-1 text-xs border border-[#ccc] rounded px-3 py-2 bg-white text-[#333] outline-none focus:border-[#006633] focus:ring-1 focus:ring-[#006633]"
            />
            <button
              onClick={handleAddKey}
              disabled={!newKey.trim() || adding}
              className="btn-primary text-xs px-3 py-2 flex items-center gap-1 shrink-0"
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add key
            </button>
          </div>
          {source === "env" && (
            <p className="text-[10px] text-[#999] mt-1.5">Keys added here are stored locally and used as fallback when env vars are not set for that provider.</p>
          )}
        </div>
      </div>

      {/* Usage Summary */}
      {keys.length > 0 && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#333] mb-3">Usage Summary</h2>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-bold text-[#333]">{totalKeys}</div>
              <div className="text-[10px] text-[#999]">Total Keys</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#333]">{totalRequests}</div>
              <div className="text-[10px] text-[#999]">Requests</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#333]">{formatTokens(totalTokens)}</div>
              <div className="text-[10px] text-[#999]">Tokens</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#333]">${totalCost.toFixed(4)}</div>
              <div className="text-[10px] text-[#999]">Cost</div>
            </div>
          </div>
        </div>
      )}

      {/* Platform info */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#333] mb-3">Platform</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between"><span className="text-[#999]">Version</span><span className="text-[#333]">1.0.0</span></div>
          <div className="flex justify-between"><span className="text-[#999]">Key source</span><span className="text-[#333]">{source === "env" ? "Environment Variables" : "Local Config"}</span></div>
        </div>
      </div>
    </div>
  );
}
