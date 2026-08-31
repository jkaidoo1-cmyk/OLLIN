/**
 * API Key Rotation System
 *
 * Reads API keys from environment variables (Vercel) with file fallback (local dev).
 * Env vars: GROQ_API_KEY (single), GROQ_API_KEYS (comma-separated), GEMINI_API_KEY
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface ApiKeyEntry {
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
}

/**
 * Get API keys — first try env vars, then fall back to config file.
 */
function getEnvKeys(): ApiKeyEntry[] {
  const keys: ApiKeyEntry[] = [];

  // Groq keys from env
  const groqSingle = process.env.GROQ_API_KEY;
  const groqMulti = process.env.GROQ_API_KEYS;
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

  // Gemini keys from env
  const geminiSingle = process.env.GEMINI_API_KEY;
  const geminiMulti = process.env.GEMINI_API_KEYS;
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
      return raw.api_keys;
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Get all API keys: env vars first, then file-based keys as fallback.
 */
export function getAllKeys(): ApiKeyEntry[] {
  const envKeys = getEnvKeys();
  const fileKeys = getFileKeys();

  // If env keys exist, use those (admin set them in Vercel dashboard)
  if (envKeys.length > 0) return envKeys;

  // Otherwise fall back to file keys (local dev / admin added via Settings)
  return fileKeys;
}

/**
 * Get the next available API key for a provider.
 */
export function getNextApiKey(preferredProvider?: string): {
  id: string;
  key: string;
  provider: string;
} | null {
  const allKeys = getAllKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled && k.key);

  if (enabledKeys.length === 0) return null;

  const sorted = [...enabledKeys].sort(
    (a, b) => a.total_requests - b.total_requests
  );

  if (preferredProvider && preferredProvider !== "auto") {
    const providerKey = sorted.find((k) => k.provider === preferredProvider);
    if (providerKey) {
      return { id: providerKey.id, key: providerKey.key, provider: providerKey.provider };
    }
  }

  const first = sorted[0];
  return { id: first.id, key: first.key, provider: first.provider };
}

/**
 * Get all enabled keys for a specific provider.
 */
export function getKeysForProvider(provider: string): Array<{
  id: string;
  key: string;
}> {
  const allKeys = getAllKeys();
  return allKeys
    .filter((k) => k.enabled && k.key && k.provider === provider)
    .sort((a, b) => a.total_requests - b.total_requests)
    .map((k) => ({ id: k.id, key: k.key }));
}

/**
 * Record usage for a key (only works for file-based keys).
 */
export async function recordKeyUsage(
  keyId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  // Skip recording for env-var keys (no file to write to)
  if (keyId.startsWith("env-")) return;

  try {
    const configPath = join(process.cwd(), ".ollin-config.json");
    if (!existsSync(configPath)) return;

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const key = config.api_keys?.find((k: { id: string }) => k.id === keyId);
    if (!key) return;

    key.total_requests = (key.total_requests || 0) + 1;
    key.total_input_tokens = (key.total_input_tokens || 0) + inputTokens;
    key.total_output_tokens = (key.total_output_tokens || 0) + outputTokens;
    key.last_used_at = new Date().toISOString();

    config.updated_at = new Date().toISOString();
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // Non-critical
  }
}

/**
 * Try multiple keys in sequence until one succeeds.
 */
export async function tryWithRotation<T>(
  operation: (apiKey: string) => Promise<T>,
  provider: string,
  onError?: (keyId: string, error: Error) => void,
  providedKeys?: Array<{ id: string; key: string }>
): Promise<{ result: T; keyId: string }> {
  const keys = providedKeys || getKeysForProvider(provider);

  if (keys.length === 0) {
    throw new Error(
      `No service configured. Please contact your administrator.`
    );
  }

  let lastError: Error | null = null;

  for (const keyEntry of keys) {
    try {
      const result = await operation(keyEntry.key);
      return { result, keyId: keyEntry.id };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      const msg = error.message.toLowerCase();
      const isRecoverable =
        msg.includes("rate") ||
        msg.includes("quota") ||
        msg.includes("limit") ||
        msg.includes("429") ||
        msg.includes("insufficient") ||
        msg.includes("billing") ||
        msg.includes("401") ||
        msg.includes("403");

      if (onError) onError(keyEntry.id, error);

      if (!isRecoverable) {
        throw error;
      }

      // Rate limit — wait and retry
      const isRateLimit = msg.includes("rate") || msg.includes("429") || msg.includes("limit");
      if (isRateLimit) {
        console.log("Rate limited, waiting 15s before retry...");
        await new Promise((r) => setTimeout(r, 15000));
        try {
          const result = await operation(keyEntry.key);
          return { result, keyId: keyEntry.id };
        } catch (retryErr) {
          lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
        }
      }
    }
  }

  throw lastError || new Error("All service attempts failed.");
}
