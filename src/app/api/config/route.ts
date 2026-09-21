import { NextRequest, NextResponse } from "next/server";
import { getAllKeys } from "@/lib/ai/key-rotation";
import { getSessionAdmin } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createAdminClient } from "@/lib/supabase/server";

const CONFIG_PATH = join(process.cwd(), ".ollin-config.json");

function generateKeyId(): string {
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}

/**
 * API key management.
 * - Supabase configured → keys live in the `api_keys` table (service-role writes).
 * - Otherwise → `.ollin-config.json` on the server (file mode).
 * Env-var keys (GROQ_API_KEY etc.) always take precedence for *usage* —
 * this route manages the admin-added key list + usage stats.
 */

async function sbReadKeys(): Promise<any[] | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("api_keys").select("*").order("added_at");
  if (error) throw new Error(error.message);
  return data || [];
}

// GET — read current key list + usage stats — admin only
export async function GET(request: NextRequest) {
  if (!(await getSessionAdmin(request))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  try {
    const sbKeys = await sbReadKeys();
    if (sbKeys) {
      return NextResponse.json({
        api_keys: sbKeys.map((k: any) => ({
          id: k.id,
          label: k.label,
          provider: k.provider,
          enabled: k.enabled,
          key_preview: maskKey(k.key),
          source: "supabase",
          added_at: k.added_at,
          last_used_at: k.last_used_at,
          last_error: k.last_error || null,
          last_error_at: k.last_error_at || null,
          total_requests: Number(k.total_requests || 0),
          total_input_tokens: Number(k.total_input_tokens || 0),
          total_output_tokens: Number(k.total_output_tokens || 0),
          estimated_cost_usd: Number(k.estimated_cost_usd || 0),
        })),
        ai_provider: "auto",
        source: "supabase",
        hint: "Keys are stored in your Supabase database.",
      });
    }

    const allKeys = await getAllKeys();
    const hasEnvKeys = !!(process.env.GROQ_API_KEY || process.env.GROQ_API_KEYS || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS);
    const source = hasEnvKeys ? "env" : "file";

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
      ai_provider: "auto",
      source,
      hint: source === "env"
        ? "Keys are loaded from Vercel Environment Variables."
        : "Keys are stored on the server.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

// POST — add, remove, toggle keys, record usage — admin only
export async function POST(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  try {
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const body = await request.json();
    const action = body.action;

    const supabase = await createAdminClient();

    if (supabase) {
      if (action === "add") {
        const id = generateKeyId();
        const { error } = await supabase.from("api_keys").insert({
          id,
          key: body.key,
          label: body.label || "Key",
          provider: body.provider || "groq",
          enabled: true,
        });
        if (error) throw new Error(error.message);
        await recordAdminAction(request, admin, "key.add", "api_key", id, `Added ${body.provider || "groq"} key ${maskKey(String(body.key || ""))}`);
        return NextResponse.json({ success: true, id });
      }
      if (action === "remove") {
        const { data: removed } = await supabase
          .from("api_keys")
          .delete()
          .eq("id", body.id)
          .select("provider, label");
        if (removed && removed.length === 0) {
          return NextResponse.json({ error: "Key not found" }, { status: 404 });
        }
        const info = removed?.[0];
        await recordAdminAction(request, admin, "key.remove", "api_key", body.id, `Removed ${info?.provider || "key"}${info?.label ? ` "${info.label}"` : ""}`);
        return NextResponse.json({ success: true });
      }
      if (action === "toggle") {
        const { error } = await supabase
          .from("api_keys")
          .update({ enabled: !!body.enabled })
          .eq("id", body.id);
        if (error) throw new Error(error.message);
        await recordAdminAction(request, admin, "key.toggle", "api_key", body.id, `${body.enabled ? "Enabled" : "Disabled"} key`);
        return NextResponse.json({ success: true });
      }
      if (action === "clear_error") {
        const { error } = await supabase
          .from("api_keys")
          .update({ last_error: null, last_error_at: null })
          .eq("id", body.id);
        if (error) throw new Error(error.message);
        await recordAdminAction(request, admin, "key.clear_error", "api_key", body.id, "Cleared key error state");
        return NextResponse.json({ success: true });
      }
      if (action === "record_usage") {
        // Atomic increment via RPC-less pattern: read then write with service role.
        const { data: key } = await supabase
          .from("api_keys")
          .select("total_requests, total_input_tokens, total_output_tokens")
          .eq("id", body.id)
          .single();
        if (key) {
          const { error } = await supabase
            .from("api_keys")
            .update({
              total_requests: Number(key.total_requests || 0) + 1,
              total_input_tokens: Number(key.total_input_tokens || 0) + (body.input_tokens || 0),
              total_output_tokens: Number(key.total_output_tokens || 0) + (body.output_tokens || 0),
              last_used_at: new Date().toISOString(),
            })
            .eq("id", body.id);
          if (error) throw new Error(error.message);
        }
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // ── File mode (no Supabase) ──
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
      try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* read-only fs */ }
      await recordAdminAction(request, admin, "key.add", "api_key", newKey.id, `Added ${newKey.provider} key ${maskKey(String(body.key || ""))}`);
      return NextResponse.json({ success: true, id: newKey.id });
    }

    if (action === "remove") {
      const removedKey = config.api_keys.find((k: any) => k.id === body.id);
      config.api_keys = config.api_keys.filter((k: any) => k.id !== body.id);
      config.updated_at = new Date().toISOString();
      try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* read-only fs */ }
      await recordAdminAction(request, admin, "key.remove", "api_key", body.id, `Removed ${removedKey?.provider || "key"}${removedKey?.label ? ` "${removedKey.label}"` : ""}`);
      return NextResponse.json({ success: true });
    }

    if (action === "toggle") {
      const key = config.api_keys.find((k: any) => k.id === body.id);
      if (key) {
        // Coerce/absent-proof: an omitted "enabled" flips the current state
        // instead of writing undefined (which disables the key).
        key.enabled = body.enabled === undefined ? !key.enabled : !!body.enabled;
      }
      config.updated_at = new Date().toISOString();
      try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* read-only fs */ }
      await recordAdminAction(request, admin, "key.toggle", "api_key", body.id, `${key?.enabled ? "Enabled" : "Disabled"} key`);
      return NextResponse.json({ success: true, enabled: key?.enabled });
    }

    if (action === "clear_error") {
      const key = config.api_keys.find((k: any) => k.id === body.id);
      if (key) {
        key.last_error = undefined;
        key.last_error_at = undefined;
      }
      config.updated_at = new Date().toISOString();
      try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* read-only fs */ }
      await recordAdminAction(request, admin, "key.clear_error", "api_key", body.id, "Cleared key error state");
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
        try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* read-only fs */ }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}
