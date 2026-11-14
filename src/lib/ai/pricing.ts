/**
 * Token pricing for the providers this app generates with.
 *
 * Usage is the only cost signal an admin has, so it has to come from a real
 * rate. `recordKeyUsage` used to be called with token counts and no price, so
 * "Requests" and "Tokens" climbed while "Cost" stayed at a placeholder value —
 * 200K tokens were reported as $0.0011.
 *
 * Rates are standard (non-batch, non-cached) list prices in USD per million
 * tokens, taken from each provider's pricing page in November 2026:
 *   - Gemini 3.5 Flash-Lite — https://ai.google.dev/gemini-api/docs/pricing
 *   - OpenAI GPT-OSS 20B on Groq — https://console.groq.com/docs/models
 * Update the table when the model in content-analyzer.ts changes.
 */

export type Provider = "gemini" | "groq";

export interface TokenPrices {
  /** Model the rate belongs to, for the UI/audit trail. */
  model: string;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

const PROVIDER_PRICES: Record<Provider, TokenPrices> = {
  // GEMINI_MODEL in content-analyzer.ts
  gemini: { model: "gemini-3.5-flash-lite", input: 0.3, output: 2.5 },
  // GROQ_MODEL in content-analyzer.ts
  groq: { model: "openai/gpt-oss-20b", input: 0.075, output: 0.3 },
};

/** Unknown provider: price it as the provider we run, never as free. */
export function pricesFor(provider: string): TokenPrices {
  return PROVIDER_PRICES[provider as Provider] || PROVIDER_PRICES.gemini;
}

/** Cost of one request, in USD. */
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  provider: string
): number {
  const rate = pricesFor(provider);
  const inTok = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const outTok = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  return (inTok * rate.input + outTok * rate.output) / 1_000_000;
}
