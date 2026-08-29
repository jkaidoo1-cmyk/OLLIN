import { NextResponse } from "next/server";

/**
 * GET — read current config from environment variables.
 * All key management happens via Vercel environment variables.
 */
export async function GET() {
  const keys: Array<{
    id: string;
    label: string;
    provider: string;
    enabled: boolean;
    key_preview: string;
    added_at: string;
    last_used_at: null;
    total_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    estimated_cost_usd: number;
  }> = [];

  // Groq keys
  const groqSingle = process.env.GROQ_API_KEY;
  const groqMulti = process.env.GROQ_API_KEYS;

  if (groqSingle) {
    keys.push({
      id: "groq-main",
      label: "Groq Key",
      provider: "groq",
      enabled: true,
      key_preview: maskKey(groqSingle),
      added_at: new Date().toISOString(),
      last_used_at: null,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      estimated_cost_usd: 0,
    });
  }
  if (groqMulti) {
    groqMulti.split(",").forEach((k, i) => {
      const trimmed = k.trim();
      if (trimmed && trimmed !== groqSingle?.trim()) {
        keys.push({
          id: `groq-${i + 1}`,
          label: `Groq Key ${i + 1}`,
          provider: "groq",
          enabled: true,
          key_preview: maskKey(trimmed),
          added_at: new Date().toISOString(),
          last_used_at: null,
          total_requests: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          estimated_cost_usd: 0,
        });
      }
    });
  }

  // Gemini keys
  const geminiSingle = process.env.GEMINI_API_KEY;
  const geminiMulti = process.env.GEMINI_API_KEYS;

  if (geminiSingle) {
    keys.push({
      id: "gemini-main",
      label: "Gemini Key",
      provider: "gemini",
      enabled: true,
      key_preview: maskKey(geminiSingle),
      added_at: new Date().toISOString(),
      last_used_at: null,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      estimated_cost_usd: 0,
    });
  }
  if (geminiMulti) {
    geminiMulti.split(",").forEach((k, i) => {
      const trimmed = k.trim();
      if (trimmed && trimmed !== geminiSingle?.trim()) {
        keys.push({
          id: `gemini-${i + 1}`,
          label: `Gemini Key ${i + 1}`,
          provider: "gemini",
          enabled: true,
          key_preview: maskKey(trimmed),
          added_at: new Date().toISOString(),
          last_used_at: null,
          total_requests: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          estimated_cost_usd: 0,
        });
      }
    });
  }

  const provider = process.env.OLLIN_AI_PROVIDER || "groq";

  return NextResponse.json({
    api_keys: keys,
    ai_provider: provider,
    updated_at: new Date().toISOString(),
    storage: "env",
  });
}

/**
 * POST — no-op for backwards compatibility.
 * Key management happens via Vercel environment variables.
 */
export async function POST() {
  return NextResponse.json({
    error: "API keys are managed via Vercel environment variables. Go to your Vercel dashboard → Settings → Environment Variables to add or update keys.",
  }, { status: 400 });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}
