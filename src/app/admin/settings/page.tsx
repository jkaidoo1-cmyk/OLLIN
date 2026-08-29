"use client";

import { useState, useEffect } from "react";
import { Loader2, Key, AlertCircle, ExternalLink } from "lucide-react";

interface ApiKeyInfo {
  id: string;
  label: string;
  provider: string;
  enabled: boolean;
  key_preview: string;
}

export default function AdminSettingsPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [provider, setProvider] = useState("groq");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setKeys(data.api_keys || []);
      setProvider(data.ai_provider || "groq");
    } catch {
      setError("Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-[#333] mb-6">Settings</h1>

      <div className="space-y-6">
        {/* ── API Keys Section ────────────────────── */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[#333]">API Keys</h2>
            <p className="text-sm text-[#666] mt-0.5">
              API keys are managed through Vercel environment variables.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* How to add keys */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">How to add API keys</h3>
            <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
              <li>Go to your <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-medium">Vercel Dashboard</a></li>
              <li>Select your OLLIN project</li>
              <li>Go to <strong>Settings</strong> → <strong>Environment Variables</strong></li>
              <li>Add one of the following variables:</li>
            </ol>
            <div className="mt-3 bg-white rounded border border-blue-100 p-3 font-mono text-xs text-[#333]">
              <p className="mb-1"><strong>For Groq:</strong></p>
              <p className="text-[#666]">GROQ_API_KEY = gsk_xxxxx</p>
              <p className="mt-2 mb-1"><strong>For multiple Groq keys (auto-rotation):</strong></p>
              <p className="text-[#666]">GROQ_API_KEYS = key1, key2, key3</p>
              <p className="mt-2 mb-1"><strong>For Google Gemini:</strong></p>
              <p className="text-[#666]">GEMINI_API_KEY = AIzaSyxxxxx</p>
              <p className="mt-2 mb-1"><strong>Set the provider:</strong></p>
              <p className="text-[#666]">OLLIN_AI_PROVIDER = groq</p>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              After adding variables, click <strong>Deployments</strong> → <strong>Redeploy</strong> to apply changes.
            </p>
          </div>

          {/* Configured keys */}
          {loading ? (
            <div className="py-8 text-center text-sm text-[#999] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : keys.length === 0 ? (
            <div className="py-8 text-center">
              <Key className="w-8 h-8 text-[#ccc] mx-auto mb-2" />
              <p className="text-sm text-[#666]">No API keys detected.</p>
              <p className="text-xs text-[#999] mt-1">Add a key in Vercel environment variables to enable AI question generation.</p>
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-[#006633] hover:underline"
              >
                Open Vercel Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="border border-[#e0e0e0] rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded flex items-center justify-center bg-green-50 text-green-600">
                      <Key className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#333]">{k.label}</p>
                      <p className="text-xs text-[#999]">{k.key_preview}</p>
                    </div>
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-medium">
                      Active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
