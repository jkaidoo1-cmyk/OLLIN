/**
 * API Key Rotation System
 *
 * Reads API keys from environment variables.
 * Supports multiple keys for automatic fallback when one runs out.
 *
 * Environment variables:
 *   GROQ_API_KEY       — single Groq key
 *   GROQ_API_KEYS      — comma-separated multiple Groq keys
 *   GEMINI_API_KEY     — single Gemini key
 *   GEMINI_API_KEYS    — comma-separated multiple Gemini keys
 *   OLLIN_AI_PROVIDER  — "groq" or "gemini" (default: "groq")
 */

export function getProviderFromEnv(): string {
  return process.env.OLLIN_AI_PROVIDER || "groq";
}

/**
 * Get all API keys from environment variables.
 * Supports both single key and comma-separated multiple keys.
 */
export function getAllApiKeys(): Array<{
  id: string;
  key: string;
  provider: string;
}> {
  const keys: Array<{ id: string; key: string; provider: string }> = [];

  // Groq keys
  const groqSingle = process.env.GROQ_API_KEY;
  const groqMulti = process.env.GROQ_API_KEYS;

  if (groqSingle) {
    keys.push({ id: "groq-main", key: groqSingle.trim(), provider: "groq" });
  }
  if (groqMulti) {
    groqMulti.split(",").forEach((k, i) => {
      const trimmed = k.trim();
      if (trimmed && trimmed !== groqSingle?.trim()) {
        keys.push({ id: `groq-${i + 1}`, key: trimmed, provider: "groq" });
      }
    });
  }

  // Gemini keys
  const geminiSingle = process.env.GEMINI_API_KEY;
  const geminiMulti = process.env.GEMINI_API_KEYS;

  if (geminiSingle) {
    keys.push({ id: "gemini-main", key: geminiSingle.trim(), provider: "gemini" });
  }
  if (geminiMulti) {
    geminiMulti.split(",").forEach((k, i) => {
      const trimmed = k.trim();
      if (trimmed && trimmed !== geminiSingle?.trim()) {
        keys.push({ id: `gemini-${i + 1}`, key: trimmed, provider: "gemini" });
      }
    });
  }

  return keys;
}

/**
 * Get the next available API key for a given provider.
 * Returns the first enabled key that isn't exhausted.
 */
export function getNextApiKey(preferredProvider?: string): {
  id: string;
  key: string;
  provider: string;
} | null {
  const allKeys = getAllApiKeys();
  const provider = preferredProvider || getProviderFromEnv();

  if (provider !== "auto") {
    const providerKeys = allKeys.filter((k) => k.provider === provider);
    if (providerKeys.length > 0) return providerKeys[0];
  }

  // Auto — return any available key
  return allKeys[0] || null;
}

/**
 * Get all enabled keys for a specific provider.
 */
export function getKeysForProvider(provider: string): Array<{
  id: string;
  key: string;
}> {
  return getAllApiKeys()
    .filter((k) => k.provider === provider)
    .map((k) => ({ id: k.id, key: k.key }));
}

/**
 * Record usage — no-op when using env vars (usage tracking requires persistent storage).
 * Kept for API compatibility with callers.
 */
export async function recordKeyUsage(
  _keyId?: string,
  _inputTokens?: number,
  _outputTokens?: number
): Promise<void> {
  // No-op: env var keys don't need usage tracking
}

/**
 * Try multiple keys in sequence until one succeeds.
 * Returns the result from the first successful call.
 */
export async function tryWithRotation<T>(
  operation: (apiKey: string) => Promise<T>,
  provider: string,
  onError?: (keyId: string, error: Error) => void
): Promise<{ result: T; keyId: string }> {
  const keys = getKeysForProvider(provider);

  if (keys.length === 0) {
    throw new Error(
      `No API keys configured for ${provider}. Set GROQ_API_KEY or GEMINI_API_KEY in your Vercel environment variables.`
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
        msg.includes("rate") || msg.includes("quota") || msg.includes("limit") ||
        msg.includes("429") || msg.includes("insufficient") || msg.includes("billing") ||
        msg.includes("auth") || msg.includes("401") || msg.includes("403");

      if (onError) onError(keyEntry.id, error);

      if (!isRecoverable) {
        throw error;
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
        }
      }
    }
  }

  throw lastError || new Error("All API keys failed");
}
