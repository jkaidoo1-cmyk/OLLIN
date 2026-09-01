import { NextRequest, NextResponse } from "next/server";
import { getAllKeys } from "@/lib/ai/key-rotation";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), ".ollin-config.json");

function generateKeyId(): string {
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}

// GET — read current config (merges env keys + file keys)
export async function GET() {
  const allKeys = getAllKeys();
  const hasEnvKeys = !!(process.env.GROQ_API_KEY || process.env.GROQ_API_KEYS || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS);
  const hasFileKeys = allKeys.some((k) => !k.id.startsWith("env-"));
  const source = hasEnvKeys ? "env" : "file";

  // Also get file-based config for usage stats
  let fileConfig: Record<string, unknown> = { api_keys: [], ai_provider: "auto" };
  try {
    if (existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    api_keys: allKeys.map((k) => ({
      id: k.id,
      label: k.label,
      provider: k.provider,
      enabled: k.enabled,
      key_preview: maskKey(k.key),
      source: k.id.startsWith("env-") ? "env" : "file",
      added_at: (k as any).added_at || null,
      last_used_at: (k as any).last_used_at || null,
      last_error: (k as any).last_error || null,
      last_error_at: (k as any).last_error_at || null,
      total_requests: k.total_requests,
      total_input_tokens: k.total_input_tokens,
      total_output_tokens: k.total_output_tokens,
      estimated_cost_usd: (k as any).estimated_cost_usd || 0,
    })),
    ai_provider: (fileConfig as any).ai_provider || "auto",
    source,
    hint: source === "env"
      ? "Keys are loaded from Vercel Environment Variables."
      : "Keys are stored locally. Add GROQ_API_KEY to Vercel Environment Variables for production.",
  });
}

// POST — add, remove, toggle keys (file-based, for local dev)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    // Load existing file config
    let config: any = { api_keys: [], ai_provider: "auto", updated_at: new Date().toISOString() };
    try {
      if (existsSync(CONFIG_PATH)) {
        config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      }
    } catch { /* ignore */ }
    if (!config.api_keys) config.api_keys = [];

    if (action === "add") {
      const newKey = {
        id: generateKeyId(),
        key: body.key,
        label: body.label || `Key ${config.api_keys.length + 1}`,
        provider: body.provider || "groq",
        enabled: true,
        added_at: new Date().toISOString(),
        last_used_at: null,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        estimated_cost_usd: 0,
      };
      config.api_keys.push(newKey);
      config.updated_at = new Date().toISOString();
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      return NextResponse.json({ success: true, id: newKey.id });
    }

    if (action === "remove") {
      config.api_keys = config.api_keys.filter((k: any) => k.id !== body.id);
      config.updated_at = new Date().toISOString();
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      return NextResponse.json({ success: true });
    }

    if (action === "toggle") {
      const key = config.api_keys.find((k: any) => k.id === body.id);
      if (key) key.enabled = body.enabled;
      config.updated_at = new Date().toISOString();
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      return NextResponse.json({ success: true });
    }

    if (action === "clear_error") {
      const key = config.api_keys.find((k: any) => k.id === body.id);
      if (key) {
        key.last_error = undefined;
        key.last_error_at = undefined;
      }
      config.updated_at = new Date().toISOString();
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      return NextResponse.json({ success: true });
    }

    if (action === "record_usage") {
      const key = config.api_keys.find((k: any) => k.id === body.id);
      if (key) {
        key.total_requests += 1;
        key.total_input_tokens += body.input_tokens || 0;
        key.total_output_tokens += body.output_tokens || 0;
        key.last_used_at = new Date().toISOString();
        config.updated_at = new Date().toISOString();
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
