import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), ".ollin-config.json");

export interface ApiKeyEntry {
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

export interface PlatformConfig {
  api_keys: ApiKeyEntry[];
  ai_provider: string;
  updated_at: string;
}

function generateKeyId(): string {
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function loadConfig(): PlatformConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      // Migrate old format: single key → array
      if (raw.openai_api_key && !raw.api_keys) {
        return {
          api_keys: [
            {
              id: generateKeyId(),
              key: raw.openai_api_key,
              label: "Primary Key",      provider: (raw.ai_provider as "groq" | "gemini") || "groq",
      enabled: true,
      added_at: raw.updated_at || new Date().toISOString(),
      last_used_at: null,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      estimated_cost_usd: 0,
    },
          ],
          ai_provider: raw.ai_provider || "groq",
          updated_at: raw.updated_at || new Date().toISOString(),
        };
      }
      return raw;
    } catch {
      // ignore
    }
  }
  return {
    api_keys: [],
    ai_provider: "auto",
    updated_at: new Date().toISOString(),
  };
}

function saveConfig(config: PlatformConfig): void {
  config.updated_at = new Date().toISOString();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}

// GET — read current config
export async function GET() {
  const config = loadConfig();
  return NextResponse.json({
    api_keys: config.api_keys.map((k) => ({
      id: k.id,
      label: k.label,
      provider: k.provider,
      enabled: k.enabled,
      key_preview: maskKey(k.key),
      added_at: k.added_at,
      last_used_at: k.last_used_at,
      total_requests: k.total_requests,
      total_input_tokens: k.total_input_tokens,
      total_output_tokens: k.total_output_tokens,
      estimated_cost_usd: k.estimated_cost_usd,
    })),
    ai_provider: config.ai_provider,
    updated_at: config.updated_at,
  });
}

// POST — add, update, delete keys, or record usage
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = loadConfig();
    const action = body.action;

    // ── Add a new key ──────────────────────────
    if (action === "add") {
      const newKey: ApiKeyEntry = {
        id: generateKeyId(),
        key: body.key,
        label: body.label || `Key ${config.api_keys.length + 1}`,
        provider: (body.provider as "groq" | "gemini") || "groq",
        enabled: true,
        added_at: new Date().toISOString(),
        last_used_at: null,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        estimated_cost_usd: 0,
      };
      config.api_keys.push(newKey);
      saveConfig(config);
      return NextResponse.json({ success: true, id: newKey.id });
    }

    // ── Remove a key ──────────────────────────
    if (action === "remove") {
      config.api_keys = config.api_keys.filter((k) => k.id !== body.id);
      saveConfig(config);
      return NextResponse.json({ success: true });
    }

    // ── Toggle key enabled/disabled ───────────
    if (action === "toggle") {
      const key = config.api_keys.find((k) => k.id === body.id);
      if (key) key.enabled = body.enabled;
      saveConfig(config);
      return NextResponse.json({ success: true });
    }

    // ── Update label ──────────────────────────
    if (action === "update_label") {
      const key = config.api_keys.find((k) => k.id === body.id);
      if (key) key.label = body.label;
      saveConfig(config);
      return NextResponse.json({ success: true });
    }

    // ── Record token usage after a request ────
    if (action === "record_usage") {
      const key = config.api_keys.find((k) => k.id === body.id);
      if (key) {
        key.total_requests += 1;
        key.total_input_tokens += body.input_tokens || 0;
        key.total_output_tokens += body.output_tokens || 0;
        key.last_used_at = new Date().toISOString();
        // Groq free tier pricing estimate
        const costPerInput = 0.10 / 1_000_000;
        const costPerOutput = 0.10 / 1_000_000;
        key.estimated_cost_usd +=
          (body.input_tokens || 0) * costPerInput +
          (body.output_tokens || 0) * costPerOutput;
        saveConfig(config);
      }
      return NextResponse.json({ success: true });
    }

    // ── Update provider ──────────────────────
    if (action === "set_provider") {
      config.ai_provider = body.provider || "auto";
      saveConfig(config);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
