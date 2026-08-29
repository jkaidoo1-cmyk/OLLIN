/**
 * API Key Rotation System
 *
 * Manages multiple API keys with automatic fallback.
 * When a key fails (rate limit, quota, auth error), it tries the next enabled key.
 * Records usage after each successful request.
 *
 * Provider: Groq (OpenAI-compatible API)
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
}

interface PlatformConfig {
  api_keys: ApiKeyEntry[];
  ai_provider: string;
}

function loadConfig(): PlatformConfig {
  const configPath = join(process.cwd(), ".ollin-config.json");
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      // Migrate old format (single key → array)
      if (raw.openai_api_key && !raw.api_keys) {
        return {
          api_keys: [
            {
              id: "migrated",
              key: raw.openai_api_key,
              label: "Primary Key",
              provider: (raw.ai_provider as "groq" | "gemini") || "groq",
              enabled: true,
              total_requests: 0,
              total_input_tokens: 0,
              total_output_tokens: 0,
            },
          ],
          ai_provider: raw.ai_provider || "auto",
        };
      }
      return raw;
    } catch {
      // ignore
    }
  }
  return { api_keys: [], ai_provider: "auto" };
}

/**
 * Get the next available API key.
 * Returns the first enabled key that isn't exhausted.
 * Keys are tried in order of least usage first.
 */
export function getNextApiKey(preferredProvider?: string): {
  id: string;
  key: string;
  provider: string;
} | null {
  const config = loadConfig();
  const enabledKeys = config.api_keys.filter((k) => k.enabled && k.key);

  if (enabledKeys.length === 0) return null;

  // Sort by total requests (least used first) to distribute load
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
 * Get all enabled keys for a specific provider, sorted by least usage.
 */
export function getKeysForProvider(provider: string): Array<{
  id: string;
  key: string;
}> {
  const config = loadConfig();
  return config.api_keys
    .filter((k) => k.enabled && k.key && k.provider === provider)
    .sort((a, b) => a.total_requests - b.total_requests)
    .map((k) => ({ id: k.id, key: k.key }));
}

/**
 * Record usage for a key after a successful API call.
 */
export async function recordKeyUsage(
  keyId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
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
    // Pricing estimate (per million tokens)
    const costPerInput = 0.10 / 1_000_000;
    const costPerOutput = 0.10 / 1_000_000;
    key.estimated_cost_usd = (key.estimated_cost_usd || 0) +
      inputTokens * costPerInput + outputTokens * costPerOutput;

    config.updated_at = new Date().toISOString();
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // Non-critical — don't break the flow
  }
}

/**
 * Try multiple keys in sequence until one succeeds.
 * Returns the result from the first successful call.
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
      `No API keys configured for ${provider}. Add a key in Admin > Settings.`
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

      // Only try next key on recoverable errors
      const msg = error.message.toLowerCase();
      const isRecoverable =
        msg.includes("rate") ||
        msg.includes("quota") ||
        msg.includes("limit") ||
        msg.includes("429") ||
        msg.includes("insufficient") ||
        msg.includes("billing") ||
        msg.includes("auth") ||
        msg.includes("401") ||
        msg.includes("403");

      if (onError) onError(keyEntry.id, error);

      if (!isRecoverable) {
        throw error; // Non-recoverable — don't try other keys
      }

      // Rate limit — wait and retry the same key
      const isRateLimit = msg.includes("rate") || msg.includes("429") || msg.includes("limit");
      if (isRateLimit) {
        console.log("Rate limited, waiting 15s before retry...");
        await new Promise((r) => setTimeout(r, 15000));
        try {
          const result = await operation(keyEntry.key);
          return { result, keyId: keyEntry.id };
        } catch (retryErr) {
          lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          console.error("Retry also failed:", lastError.message);
        }
      }

      // Continue to next key
    }
  }

  throw lastError || new Error("All API keys failed");
}
