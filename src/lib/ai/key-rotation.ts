/**
 * API Key Rotation System
 *
 * Key sources, in order:
 *   1. Supabase `api_keys` table (admin-added keys — persistent, works on any host)
 *   2. `.ollin-config.json` (file mode — local dev)
 *   3. Environment variables (GROQ_API_KEY(S), GEMINI_API_KEY(S)) — always merged in
 *
 * Usage/error state is written back to whichever store the key came from.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface ApiKeyEntry {
  id: string;
  key: string;
  label: string;
  provider: "groq" | "gemini";
  enabled: boolean;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd?: number;
  last_used_at?: string;
  added_at?: string;
  last_error?: string;
  last_error_at?: string;
}

function getEnvKeys(): ApiKeyEntry[] {
  const keys: ApiKeyEntry[] = [];

  const groqMulti = process.env.GROQ_API_KEYS;
  const groqSingle = process.env.GROQ_API_KEY;
  if (groqMulti) {
    groqMulti.split(",").forEach((k, i) => {
      const trimmed = k.trim();
      if (trimmed) {
        keys.push({
          id: `env-groq-${i}`,
          key: trimmed,
          label: `Groq Key ${i + 1}`,
          provider: "groq",
          enabled: true,
          total_requests: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
        });
      }
    });
  } else if (groqSingle) {
    keys.push({
      id: "env-groq-0",
      key: groqSingle.trim(),
      label: "Groq Key",
      provider: "groq",
      enabled: true,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
    });
  }

  const geminiMulti = process.env.GEMINI_API_KEYS;
  const geminiSingle = process.env.GEMINI_API_KEY;
  if (geminiMulti) {
    geminiMulti.split(",").forEach((k, i) => {
      const trimmed = k.trim();
      if (trimmed) {
        keys.push({
          id: `env-gemini-${i}`,
          key: trimmed,
          label: `Gemini Key ${i + 1}`,
          provider: "gemini",
          enabled: true,
          total_requests: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
        });
      }
    });
  } else if (geminiSingle) {
    keys.push({
      id: "env-gemini-0",
      key: geminiSingle.trim(),
      label: "Gemini Key",
      provider: "gemini",
      enabled: true,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
    });
  }

  return keys;
}

function getFileKeys(): ApiKeyEntry[] {
  try {
    const configPath = join(process.cwd(), ".ollin-config.json");
    if (!existsSync(configPath)) return [];
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    if (raw.api_keys && Array.isArray(raw.api_keys)) {
      // Normalize: a missing/undefined "enabled" must mean ENABLED (matching
      // the Supabase path), never disabled-by-accident.
      return raw.api_keys.map((k: any) => ({ ...k, enabled: k.enabled !== false }));
    }
  } catch { /* ignore */ }
  return [];
}

async function getSupabaseKeys(): Promise<ApiKeyEntry[]> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from("api_keys").select("*").order("added_at");
    if (error) return [];
    return (data || []).map((k: any) => ({
      id: k.id,
      key: k.key,
      label: k.label || "Key",
      provider: (k.provider === "gemini" ? "gemini" : "groq") as "groq" | "gemini",
      enabled: k.enabled !== false,
      total_requests: Number(k.total_requests || 0),
      total_input_tokens: Number(k.total_input_tokens || 0),
      total_output_tokens: Number(k.total_output_tokens || 0),
      estimated_cost_usd: Number(k.estimated_cost_usd || 0),
      last_used_at: k.last_used_at || undefined,
      added_at: k.added_at || undefined,
      last_error: k.last_error || undefined,
      last_error_at: k.last_error_at || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Get all API keys: Supabase (if configured) + env vars + file.
 * Env keys of a given provider are dropped if a stored key exists for that
 * provider, so the admin's per-key usage stats stay meaningful.
 */
export async function getAllKeys(): Promise<ApiKeyEntry[]> {
  const [sbKeys, envKeys, fileKeys] = await Promise.all([
    getSupabaseKeys(),
    Promise.resolve(getEnvKeys()),
    Promise.resolve(getFileKeys()),
  ]);

  // Prefer stored keys (Supabase) over the file; env keys fill gaps per provider.
  const stored = sbKeys.length > 0 ? sbKeys : fileKeys;
  const storedProviders = new Set(stored.map((k) => k.provider));
  const uniqueEnvKeys = envKeys.filter((k) => !storedProviders.has(k.provider));

  return [...stored, ...uniqueEnvKeys];
}

function isQuotaError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("rate") || m.includes("429") || m.includes("limit") ||
    m.includes("quota") || m.includes("insufficient") ||
    m.includes("billing") || m.includes("401") || m.includes("403")
  );
}

/**
 * Get enabled keys for a provider, rotating: least-used first, and keys
 * with a recent quota/auth error go to the back of the line.
 */
export async function getKeysForProvider(provider: string): Promise<Array<{ id: string; key: string }>> {
  const allKeys = await getAllKeys();
  return allKeys
    .filter((k) => k.enabled && k.key && k.provider === provider)
    .sort((a, b) => {
      const aErr = a.last_error ? 1 : 0;
      const bErr = b.last_error ? 1 : 0;
      if (aErr !== bErr) return aErr - bErr; // healthy keys first
      return a.total_requests - b.total_requests; // least-used first
    })
    .map((k) => ({ id: k.id, key: k.key }));
}

/**
 * Record usage for a key in whichever store it came from.
 */
export async function recordKeyUsage(
  keyId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd?: number
): Promise<void> {
  if (keyId.startsWith("env-")) return;

  // Supabase first
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    if (supabase) {
      // Read current values, then increment (row may be file-mode only)
      const { data: row } = await supabase
        .from("api_keys")
        .select("total_requests, total_input_tokens, total_output_tokens, estimated_cost_usd")
        .eq("id", keyId)
        .single();
      if (row) {
        const { error } = await supabase
          .from("api_keys")
          .update({
            total_requests: Number(row.total_requests || 0) + 1,
            total_input_tokens: Number(row.total_input_tokens || 0) + inputTokens,
            total_output_tokens: Number(row.total_output_tokens || 0) + outputTokens,
            estimated_cost_usd: Number(row.estimated_cost_usd || 0) + (costUsd || 0),
            last_used_at: new Date().toISOString(),
          })
          .eq("id", keyId);
        if (!error) return;
      }
    }
  } catch { /* fall through to file */ }

  // File mode
  try {
    const configPath = join(process.cwd(), ".ollin-config.json");
    if (!existsSync(configPath)) return;
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const key = config.api_keys?.find((k: { id: string }) => k.id === keyId);
    if (!key) return;
    key.total_requests = (key.total_requests || 0) + 1;
    key.total_input_tokens = (key.total_input_tokens || 0) + inputTokens;
    key.total_output_tokens = (key.total_output_tokens || 0) + outputTokens;
    key.estimated_cost_usd = (key.estimated_cost_usd || 0) + (costUsd || 0);
    key.last_used_at = new Date().toISOString();
    config.updated_at = new Date().toISOString();
    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch { /* read-only fs */ }
  } catch { /* non-critical */ }
}

/**
 * Record a key failure (rate limit, quota exhausted, invalid, etc.)
 */
export async function recordKeyError(keyId: string, errorMessage: string): Promise<void> {
  if (keyId.startsWith("env-")) return;
  if (!isQuotaError(errorMessage)) return;

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    if (supabase) {
      const { error } = await supabase
        .from("api_keys")
        .update({ last_error: errorMessage, last_error_at: new Date().toISOString() })
        .eq("id", keyId);
      if (!error) return;
    }
  } catch { /* fall through */ }

  try {
    const configPath = join(process.cwd(), ".ollin-config.json");
    if (!existsSync(configPath)) return;
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const key = config.api_keys?.find((k: { id: string }) => k.id === keyId);
    if (!key) return;
    key.last_error = errorMessage;
    key.last_error_at = new Date().toISOString();
    config.updated_at = new Date().toISOString();
    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch { /* read-only fs */ }
  } catch { /* non-critical */ }
}

/**
 * Clear a key's error status (after a successful call).
 */
export async function clearKeyError(keyId: string): Promise<void> {
  if (keyId.startsWith("env-")) return;

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    if (supabase) {
      const { error } = await supabase
        .from("api_keys")
        .update({ last_error: null, last_error_at: null })
        .eq("id", keyId);
      if (!error) return;
    }
  } catch { /* fall through */ }

  try {
    const configPath = join(process.cwd(), ".ollin-config.json");
    if (!existsSync(configPath)) return;
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const key = config.api_keys?.find((k: { id: string }) => k.id === keyId);
    if (!key) return;
    if (key.last_error) {
      key.last_error = undefined;
      key.last_error_at = undefined;
      config.updated_at = new Date().toISOString();
      try {
        writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch { /* read-only fs */ }
    }
  } catch { /* non-critical */ }
}

/**
 * Try multiple keys in sequence until one succeeds.
 * `onKeyUsed` lets the caller record token usage against the winning key.
 */
export async function tryWithRotation<T>(
  operation: (apiKey: string) => Promise<T>,
  provider: string,
  onKeyUsed?: (keyId: string) => void,
  providedKeys?: Array<{ id: string; key: string }>
): Promise<{ result: T; keyId: string }> {
  const keys = providedKeys || (await getKeysForProvider(provider));

  if (keys.length === 0) {
    throw new Error("No service configured. Please contact your administrator.");
  }

  let lastError: Error | null = null;

  for (const keyEntry of keys) {
    try {
      const result = await operation(keyEntry.key);
      clearKeyError(keyEntry.id);
      onKeyUsed?.(keyEntry.id);
      return { result, keyId: keyEntry.id };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      recordKeyError(keyEntry.id, error.message);

      const msg = error.message.toLowerCase();
      const isRateLimit = msg.includes("rate") || msg.includes("429") || msg.includes("limit");
      const isAuthError = msg.includes("401") || msg.includes("403") || msg.includes("invalid") || msg.includes("unauthorized");
      const isQuota = msg.includes("quota") || msg.includes("insufficient") || msg.includes("billing");

      // Non-recoverable errors: stop immediately (bad key, not a capacity issue)
      if (isAuthError && !isQuota) throw error;

      // Rate limit — brief pause, one retry on the same key, then move on
      if (isRateLimit) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const result = await operation(keyEntry.key);
          clearKeyError(keyEntry.id);
          onKeyUsed?.(keyEntry.id);
          return { result, keyId: keyEntry.id };
        } catch (retryErr) {
          lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
        }
      }
    }
  }

  throw lastError || new Error("All service attempts failed.");
}
