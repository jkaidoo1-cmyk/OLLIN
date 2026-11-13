/**
 * OLLIN Intelligent Content Analysis & Question Generation Engine
 *
 * Deeply reads user learning materials (PDFs, DOCX, TXT, or pasted notes)
 * and uses Groq API (LLaMA 3.3 70B) to extract key concepts, facts,
 * relationships, and generate high-yield pedagogical questions.
 *
 * Uses API key rotation: tries multiple keys, falls back on failure.
 */

import { tryWithRotation } from "./key-rotation";
import { QUESTION_EXEMPLARS, QUESTION_STANDARD } from "./exemplars";

// ─── Types ─────────────────────────────────────────────

export interface ContentAnalysis {
  title: string;
  subject: string;
  keyConcepts: Concept[];
  facts: Fact[];
  definitions: Definition[];
  processes: Process[];
  relationships: Relationship[];
  terminology: string[];
  summary: string;
}

export interface Concept {
  name: string;
  description: string;
  importance: "high" | "medium" | "low";
  relatedTo: string[];
}

export interface Fact {
  statement: string;
  source: string;
  category: string;
}

export interface Definition {
  term: string;
  definition: string;
  context: string;
}

export interface Process {
  name: string;
  steps: string[];
  purpose: string;
}

export interface Relationship {
  subject: string;
  relation: string;
  object: string;
}

export interface AIOptions {
  fileData?: string;
  fileType?: string;
  fileName?: string;
  customInstructions?: string;
  /** Receives the winning key's id + token usage after a successful call. */
  onUsage?: (usage: {
    keyId: string;
    inputTokens: number;
    outputTokens: number;
  }) => void | Promise<void>;
}

// ─── API Configuration ────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
// Fallbacks walked in order when the primary model is overloaded (503),
// throttled (429) or retired (404). Google rotates model availability often.
const GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"];
// A stalled provider must not hang the request (and the UI spinner) forever.
const AI_REQUEST_TIMEOUT_MS = 75_000;

// ─── Token Estimation ───────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── AI Prompt ──────────────────────────────────────────

/** Compress material text to reduce token usage */
function compressMaterial(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")                    // collapse spaces
    .replace(/\n{3,}/g, "\n\n")                   // collapse blank lines
    .replace(/^\s*[-•*▪▸►→]\s+/gm, "")            // strip bullet chars
    .replace(/^\s*\d+[.)\]]\s+/gm, (m) => m.trim()) // normalize numbered lists
    .split("\n")
    .filter((line, i, arr) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      // Remove duplicate lines
      if (arr.findIndex((l) => l.trim() === trimmed) !== i) return false;
      // Remove lines that are just repeated headers/formatting
      if (/^[#*_\-=\s]{3,}$/.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/**
 * Prompt for exam-extraction mode: read an existing exam/test and return its
 * questions VERBATIM with the correct answers. No new question invention.
 */
export function buildExamExtractionPrompt(
  examText: string,
  fileName?: string,
  customInstructions?: string
): string {
  const compressed = compressMaterial(examText);
  const textBlock = compressed.slice(0, 6000);
  const instructionsBlock = customInstructions
    ? `\n\nExtra instructions: ${customInstructions}`
    : "";

  return `Extract every question from this exam paper. Copy each question word-for-word. For each question, determine the correct answer from the answer key, marked answers, or your own knowledge of the subject.${instructionsBlock}

Exam paper${fileName ? ` (${fileName})` : ""}:
${textBlock}

Rules:
- Copy questions exactly as written. Do not rewrite or invent questions.
- Return EVERY question in the paper, in order. Never drop one because it has no answer printed or no options listed.
- For multiple choice: options must list ALL choices exactly as they appear (no letters like A, B, C inside the text).
- If a question lists no options, write exactly four distinct plausible options of similar length (no "all of the above", no near-duplicates), place the correct answer among them, and return its zero-based index. Only if the question is genuinely open-ended (e.g. "Define osmosis", "Explain why…") return type "short_answer" with no options and the answer text in correctAnswer.
- correctAnswer is the ZERO-BASED INDEX of the correct option (multiple choice), "true"/"false" (true/false), or the answer text (short answer).
- answerKey: the EXACT TEXT of the correct option (or the short answer text) — this is the ground truth the server stores and shows after grading. It must never be empty.
- If the paper states no answers (or an answer sheet is missing), solve each question yourself from the subject matter. correctAnswer and answerKey must never be empty — an unanswered question is a failed extraction, not a safe result.
- explanation: max 12 words justifying the answer.
- Keep the exam's original title if present.

JSON only:
{"title":"","subject":"","questions":[{"type":"multiple_choice","question":"","options":["","","",""],"correctAnswer":"0","answerKey":"","explanation":""}]}`;
}

export function buildDeepAnalysisAndQuestionPrompt(
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  fileName?: string,
  customInstructions?: string
): string {
  const typeDesc = questionTypes
    .map((t) => t.replace(/_/g, " "))
    .join(" and ");

  // Compress and scale material to the question count — generating 5 questions
  // from 100 chars each doesn't need a 2000-char input (~4x token savings for
  // small quizzes).
  const compressed = compressMaterial(materialText);
  // Ground the questions in as much of the document as the model can take —
  // a 800-char window produced vague, generic questions on longer notes.
  const charLimit = Math.min(8000, Math.max(1200, questionCount * 400));
  const textBlock = compressed.length > 0
    ? compressed.slice(0, charLimit)
    : "Generate general academic questions.";

  const instructionsBlock = customInstructions
    ? `\n\nAdditional instructions: ${customInstructions}`
    : "";

  return `You are an expert exam writer. Write ${questionCount} ${typeDesc} questions that test real understanding of the material below.${instructionsBlock}

Material:
${textBlock}

${QUESTION_STANDARD}

Rules:
- Every question must be answerable from this material alone, with exactly one correct answer.
- Ask about concepts, causes, processes and definitions — not trivia or wording.
- Do not repeat a question or test the same fact twice.
- question: one complete, self-contained sentence. No markdown, no "According to the text".
- multiple_choice: exactly 4 distinct options of similar length, no "A)"/numbers, no "All of the above".
- correctAnswer: the ZERO-BASED INDEX of the correct option as a string: "0", "1", "2" or "3".
- answerKey: the EXACT TEXT of the correct option — this is the ground truth, never leave it empty.
- true_false: options ["True","False"] and correctAnswer is "true" or "false".
- explanation: max 15 words, why the answer is right.

Examples of the standard expected (other subjects — match this quality, do not reuse their content):
${QUESTION_EXEMPLARS}

JSON only:
{"title":"","subject":"","questions":[{"type":"multiple_choice","question":"","options":["","","",""],"correctAnswer":"0","answerKey":"","explanation":""}]}`;
}

// ─── Main Generation Entry Point ─────────────────────────

export async function analyzeAndGenerate(
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  options: AIOptions = {}
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  // Keys live server-side only (Supabase / config file / env) — never from the client.
  const { getAllKeys } = await import("./key-rotation");
  const allKeys = await getAllKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled && k.key);

  if (enabledKeys.length === 0) {
    throw new Error("No service configured. Please contact your administrator.");
  }

  // Group keys by provider
  const providers = [...new Set(enabledKeys.map((k) => k.provider))];
  let lastError: Error | null = null;

  for (const p of providers) {
    try {
      const { result, keyId } = await tryWithRotation(
        (apiKey) => callAIProvider(p, materialText, questionCount, questionTypes, apiKey, options.fileData, options.fileType, options.fileName, options.customInstructions),
        p
      );
      // Surface usage so the caller (generate route) can record it per key.
      const usage = (result as { __usage?: { inputTokens: number; outputTokens: number } }).__usage;
      await options.onUsage?.({ keyId, inputTokens: usage?.inputTokens || 0, outputTokens: usage?.outputTokens || 0 });
      delete (result as { __usage?: unknown }).__usage;
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;
      console.error(`${p} provider failed:`, error.message);
      continue;
    }
  }

  if (lastError) {
    const msg = lastError.message.toLowerCase();
    // Network/timeout failures are infrastructure problems, not bad material —
    // say so plainly instead of a generic "generation failed".
    if (msg.includes("timed out") || msg.includes("aborted") || msg.includes("timeout")) {
      throw new Error("The AI service took too long to respond. Please try again.");
    }
    if (
      msg.includes("fetch failed") || msg.includes("econn") ||
      msg.includes("enotfound") || msg.includes("network")
    ) {
      throw new Error("Could not reach the AI service from the server. Please try again in a moment.");
    }
    if (msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") || msg.includes("overloaded")) {
      throw new Error("The AI service is busy right now. Please try again in a minute.");
    }
    if (msg.includes("rate") || msg.includes("429") || msg.includes("limit")) {
      throw new Error("Too many requests. Please wait a moment and try again.");
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("invalid")) {
      throw new Error("Service authentication failed. Please contact your administrator.");
    }
    throw new Error("Question generation failed. Please try again or contact your administrator.");
  }

  throw new Error("No service configured. Please contact your administrator.");
}

// ─── AI Provider Routing ──────────────────────────────

async function callAIProvider(
  provider: string,
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  apiKey: string,
  fileData?: string,
  fileType?: string,
  fileName?: string,
  customInstructions?: string,
  mode: "generate" | "exam" | "complete" = "generate"
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  if (provider === "gemini") {
    return callGeminiAPI(materialText, questionCount, questionTypes, apiKey, fileData, fileType, fileName, customInstructions, mode);
  }
  return callGroqAPI(materialText, questionCount, questionTypes, apiKey, fileData, fileType, fileName, customInstructions, mode);
}

// ─── Exam Extraction Entry Point ─────────────────────────

/**
 * Extract questions (with answers) from an existing exam paper.
 * No question generation — the exam already contains the questions.
 */
export async function extractFromExam(
  examText: string,
  options: AIOptions = {}
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  const { getAllKeys } = await import("./key-rotation");
  const allKeys = await getAllKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled && k.key);

  if (enabledKeys.length === 0) {
    throw new Error("No service configured. Please contact your administrator.");
  }

  const providers = [...new Set(enabledKeys.map((k) => k.provider))];
  let lastError: Error | null = null;

  for (const p of providers) {
    try {
      const { result, keyId } = await tryWithRotation(
        (apiKey) => callAIProvider(p, examText, 0, [], apiKey, options.fileData, options.fileType, options.fileName, options.customInstructions, "exam"),
        p
      );
      const usage = (result as { __usage?: { inputTokens: number; outputTokens: number } }).__usage;
      await options.onUsage?.({ keyId, inputTokens: usage?.inputTokens || 0, outputTokens: usage?.outputTokens || 0 });
      delete (result as { __usage?: unknown }).__usage;
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;
      console.error(`${p} exam extraction failed:`, error.message);
      continue;
    }
  }

  if (lastError) {
    const msg = lastError.message.toLowerCase();
    // Network/timeout failures are infrastructure problems, not bad material —
    // say so plainly instead of a generic "generation failed".
    if (msg.includes("timed out") || msg.includes("aborted") || msg.includes("timeout")) {
      throw new Error("The AI service took too long to respond. Please try again.");
    }
    if (
      msg.includes("fetch failed") || msg.includes("econn") ||
      msg.includes("enotfound") || msg.includes("network")
    ) {
      throw new Error("Could not reach the AI service from the server. Please try again in a moment.");
    }
    if (msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") || msg.includes("overloaded")) {
      throw new Error("The AI service is busy right now. Please try again in a minute.");
    }
    if (msg.includes("rate") || msg.includes("429") || msg.includes("limit")) {
      throw new Error("Too many requests. Please wait a moment and try again.");
    }
    throw new Error("Extraction failed. Please try again or contact your administrator.");
  }
  throw new Error("No service configured. Please contact your administrator.");
}

// ─── Groq API ─────────────────────────────────────────

// ─── Answer Completion ─────────────────────────────────

export interface PendingQuestion {
  question: string;
  options?: string[];
}

/**
 * Prompt for completing questions that arrived with no answer (and often no
 * options). Unlike exam extraction this is not copying anything — it solves
 * each question and, when options are missing, writes four plausible ones
 * around the answer so the result is a full, gradeable set.
 */
export function buildCompletionPrompt(listAndSource: string): string {
  return `An exam paper was uploaded without its answer key. Complete EVERY question below.

Rules:
- Answer each question from the source material first; if the material does not cover it, use your subject knowledge. Never leave one unanswered and never drop one.
- If the question already lists options, pick the correct one, return its ZERO-BASED INDEX in correctAnswer, and put its exact text in answerKey.
- If it lists no options, write exactly four distinct plausible options of similar length (they must be real distractors — misconceptions or reversed relationships — not near-copies of the answer, and no "all of the above"), include the correct answer among them, and return its zero-based index.
- If it is genuinely open-ended ("Define…", "Explain why…"), set type "short_answer", omit options, and put the expected answer in both correctAnswer and answerKey (max 12 words).
- explanation: max 12 words.
- Return the same number of questions, in the same order.

${listAndSource}

JSON only:
{"questions":[{"type":"multiple_choice","question":"","options":["","","",""],"correctAnswer":"0","answerKey":"","explanation":""}]}`;
}

/**
 * Solve extracted questions that have no key and, where needed, build their
 * options. Returns [] only when there was nothing to do; throws when no
 * provider could answer, so the caller can report partial results.
 */
export async function completeQuestions(
  pending: PendingQuestion[],
  materialText: string,
  options: AIOptions = {}
): Promise<unknown[]> {
  if (pending.length === 0) return [];

  const { getAllKeys } = await import("./key-rotation");
  const allKeys = await getAllKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled && k.key);
  if (enabledKeys.length === 0) {
    throw new Error("No service configured. Please contact your administrator.");
  }

  const source = compressMaterial(materialText).slice(0, 6000);
  const list = pending
    .map((p, i) =>
      `${i + 1}. ${p.question}${p.options && p.options.length ? `\n   Given options: ${p.options.join(" | ")}` : ""}`
    )
    .join("\n");
  const payload = `Source material:\n${source}\n\nQuestions to complete:\n${list}`;

  const providers = [...new Set(enabledKeys.map((k) => k.provider))];
  let lastError: Error | null = null;

  for (const p of providers) {
    try {
      const { result, keyId } = await tryWithRotation(
        (apiKey) =>
          callAIProvider(
            p,
            payload,
            pending.length,
            ["multiple_choice"],
            apiKey,
            undefined,
            undefined,
            undefined,
            undefined,
            "complete"
          ),
        p
      );
      const usage = (result as { __usage?: { inputTokens: number; outputTokens: number } }).__usage;
      await options.onUsage?.({
        keyId,
        inputTokens: usage?.inputTokens || 0,
        outputTokens: usage?.outputTokens || 0,
      });
      delete (result as { __usage?: unknown }).__usage;
      return result.questions || [];
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`${p} answer completion failed:`, lastError.message);
      continue;
    }
  }

  throw lastError || new Error("Could not complete the extracted questions.");
}

async function callGroqAPI(
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  apiKey: string,
  fileData?: string,
  fileType?: string,
  fileName?: string,
  customInstructions?: string,
  mode: "generate" | "exam" | "complete" = "generate"
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  const prompt = mode === "exam"
    ? buildExamExtractionPrompt(materialText, fileName, customInstructions)
    : mode === "complete"
      ? buildCompletionPrompt(materialText)
      : buildDeepAnalysisAndQuestionPrompt(materialText, questionCount, questionTypes, fileName, customInstructions);

  // Tighter output budget: ~55 tokens per question covers question + options
  // + short explanation at the slimmed-down schema.
  const maxTok = mode === "complete"
    ? 4096
    : Math.min(4096, Math.max(1800, 320 + questionCount * 130));
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: "Output valid JSON only. No markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: maxTok,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content;    if (!textContent) throw new Error("Empty response from service.");

  const parsed = parseAIJSONResponse(textContent);
  // Attach usage metadata for per-key recording.
  (parsed as { __usage?: { inputTokens: number; outputTokens: number } }).__usage = {
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
  return parsed;
}

// ─── Gemini API (OpenAI-compatible) ───────────────────

async function callGeminiAPI(
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  apiKey: string,
  fileData?: string,
  fileType?: string,
  fileName?: string,
  customInstructions?: string,
  mode: "generate" | "exam" | "complete" = "generate"
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  const prompt = mode === "exam"
    ? buildExamExtractionPrompt(materialText, fileName, customInstructions)
    : mode === "complete"
      ? buildCompletionPrompt(materialText)
      : buildDeepAnalysisAndQuestionPrompt(materialText, questionCount, questionTypes, fileName, customInstructions);

  // Exam papers need room for the full question list; small counts still need
  // a generous floor because the JSON wrapper alone is several hundred tokens.
  const maxTok = mode === "exam"
    ? 8192
    : mode === "complete"
      ? 4096
      : Math.min(4096, Math.max(1800, 256 + questionCount * 300));

  // Gemini regularly returns 503 “high demand” (and retires model names), so
  // walk a chain of model names and use the first one that answers. This is
  // what keeps generation working when a single model is unavailable.
  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Output valid JSON only. No markdown." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: maxTok,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        const error = Object.assign(
          new Error(`API Error (${response.status}) ${model}: ${errText}`),
          { fatal: ![404, 429, 503].includes(response.status) }
        );
        lastError = error;
        if (error.fatal) throw error;   // bad key / bad request — stop here
        continue;                        // busy or retired model — try the next
      }

      const data = await response.json();
      const textContent = data.choices?.[0]?.message?.content;
      if (!textContent) throw new Error("Empty response from service.");

      const parsed = parseAIJSONResponse(textContent);
      (parsed as { __usage?: { inputTokens: number; outputTokens: number } }).__usage = {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };
      return parsed;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if ((error as { fatal?: boolean }).fatal) throw error;
      lastError = error;
      // Timeout / connection reset on one model — still worth the next one.
      if (models.indexOf(model) === models.length - 1) throw error;
    }
  }

  throw lastError || new Error("Empty response from service.");
}

// ─── JSON Response Parser ─────────────────────────────

function parseAIJSONResponse(rawText: string): { analysis: ContentAnalysis; questions: unknown[] } {
  // Strip markdown code blocks and thinking tags
  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();

  // Extract the first { ... } block
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Replace literal newlines inside strings with spaces
  // This fixes models that pretty-print JSON with newlines in string values
  cleaned = cleaned.replace(/"[^"]*"/g, (match) => match.replace(/\n/g, " "));

  const parsed = JSON.parse(cleaned);
  return {
    analysis: parsed.analysis || {
      title: "Material Analysis",
      subject: "General Study",
      summary: "Generated quiz based on uploaded document.",
      keyConcepts: [],
      facts: [],
      definitions: [],
      processes: [],
      relationships: [],
      terminology: [],
    },
    questions: (parsed.questions || []).map(cleanQuestion),
  };
}

import { cleanText } from "@/lib/utils";

function cleanQuestion(q: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...q };
  if (typeof cleaned.question === "string") cleaned.question = cleanText(cleaned.question);
  if (typeof cleaned.explanation === "string") cleaned.explanation = cleanText(cleaned.explanation);
  if (typeof cleaned.topic === "string") cleaned.topic = cleanText(cleaned.topic);
  if (Array.isArray(cleaned.options)) {
    cleaned.options = cleaned.options.map((opt: unknown) =>
      typeof opt === "string" ? cleanText(opt) : opt
    );
  }
  return cleaned;
}

// ─── Semantic Document Parser & Question Builder ────────

function generateSemanticAnalysis(text: string): ContentAnalysis {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);

  const headers = lines.filter(
    (l) => l.length < 80 && (l.endsWith(":") || /^[A-Z0-9\s.\-]{3,60}$/.test(l) || /^(Chapter|Section|Unit|Topic)\b/i.test(l))
  );

  const subject = detectSubject(text);
  const definitions = findDefinitions(text);
  const processes = findProcesses(text);

  return {
    title: headers[0]?.replace(/[:#]/g, "").trim() || sentences[0]?.slice(0, 60) || "Study Guide",
    subject,
    summary: sentences.slice(0, 3).join(". ") + ".",
    keyConcepts: sentences.slice(0, 10).map((s, i) => ({
      name: extractMainTopic(s),
      description: s.slice(0, 200),
      importance: (i < 3 ? "high" : i < 7 ? "medium" : "low") as "high" | "medium" | "low",
      relatedTo: [],
    })),
    facts: sentences.slice(0, 15).map((s, i) => ({
      statement: s.slice(0, 220),
      source: headers[Math.floor(i / 3)] || "General Content",
      category: subject,
    })),
    definitions: definitions.slice(0, 8),
    processes: processes.slice(0, 4),
    relationships: extractRelationships(sentences).slice(0, 8),
    terminology: [...new Set(text.match(/\b[A-Z][a-z]{4,}\b/g) || [])].slice(0, 15),
  };
}

function generateDeepDocumentQuestions(
  analysis: ContentAnalysis,
  count: number,
  types: string[],
  materialText: string
): unknown[] {
  const questions: unknown[] = [];
  const definitions = analysis.definitions;
  const facts = analysis.facts;
  const concepts = analysis.keyConcepts;
  const processes = analysis.processes;
  const relationships = analysis.relationships;

  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  for (const def of definitions) {
    if (questions.length >= count) break;
    const otherDefs = shuffle(definitions.filter((d) => d.term !== def.term)).slice(0, 3);
    const wrongAnswers = otherDefs.map((d) => d.definition);
    while (wrongAnswers.length < 3) {
      wrongAnswers.push(`A secondary mechanism in ${analysis.subject.toLowerCase()} unrelated to ${def.term.toLowerCase()}`);
    }
    const options = shuffle([def.definition, ...wrongAnswers.slice(0, 3)]);
    const correctIdx = options.indexOf(def.definition);
    questions.push({
      type: types.includes("multiple_choice") ? "multiple_choice" : types[0],
      question: `In the context of ${analysis.subject}, which best defines "${def.term}"?`,
      options,
      correctAnswer: String(correctIdx >= 0 ? correctIdx : 0),
      explanation: `The material defines ${def.term} as: "${def.definition}"`,
      topic: def.term,
      difficulty: "easy",
    });
  }

  for (const proc of processes) {
    if (questions.length >= count) break;
    if (proc.steps.length >= 2) {
      const options = shuffle([
        proc.steps[0],
        ...proc.steps.slice(1, 4),
        `Bypassing ${proc.name.toLowerCase()} completely`,
      ]).slice(0, 4);
      const correctIdx = options.indexOf(proc.steps[0]);
      questions.push({
        type: "multiple_choice",
        question: `According to the material, what initiates the process of ${proc.name}?`,
        options,
        correctAnswer: String(correctIdx >= 0 ? correctIdx : 0),
        explanation: `${proc.name} begins with: ${proc.steps[0]}`,
        topic: proc.name,
        difficulty: "medium",
      });
    }
  }

  for (const rel of relationships) {
    if (questions.length >= count) break;
    const wrongObjects = shuffle(concepts.filter((c) => c.name !== rel.object).map((c) => c.name)).slice(0, 3);
    while (wrongObjects.length < 3) {
      wrongObjects.push(`Negative feedback regulation of ${rel.subject}`);
    }
    const options = shuffle([rel.object, ...wrongObjects.slice(0, 3)]);
    const correctIdx = options.indexOf(rel.object);
    questions.push({
      type: "multiple_choice",
      question: `How does ${rel.subject} interact with other elements in the system described?`,
      options,
      correctAnswer: String(correctIdx >= 0 ? correctIdx : 0),
      explanation: `The material specifies that ${rel.subject} ${rel.relation} ${rel.object}.`,
      topic: rel.subject,
      difficulty: "hard",
    });
  }

  if (types.includes("true_false")) {
    for (const fact of facts) {
      if (questions.length >= count) break;
      const isTrue = Math.random() > 0.4;
      let statement = fact.statement;
      if (!isTrue) {
        statement = statement.replace(/\b(is|are|can|will|causes)\b/i, "$1 not");
      }
      questions.push({
        type: "true_false",
        question: `True or False: ${statement}`,
        options: ["True", "False"],
        correctAnswer: isTrue ? "true" : "false",
        explanation: isTrue
          ? `Correct. The document states: "${fact.statement}"`
          : `False. The document actual statement is: "${fact.statement}"`,
        topic: fact.source || analysis.subject,
        difficulty: isTrue ? "easy" : "medium",
      });
    }
  }

  for (const concept of concepts) {
    if (questions.length >= count) break;
    const otherConcepts = shuffle(concepts.filter((c) => c.name !== concept.name)).slice(0, 3);
    const options = shuffle([
      concept.description,
      ...otherConcepts.map((c) => c.description),
    ]).slice(0, 4);
    const correctIdx = options.indexOf(concept.description);
    questions.push({
      type: "multiple_choice",
      question: `Which statement accurately reflects the principle of "${concept.name}" as described in the material?`,
      options,
      correctAnswer: String(correctIdx >= 0 ? correctIdx : 0),
      explanation: `The material describes ${concept.name} as: "${concept.description}"`,
      topic: concept.name,
      difficulty: "medium",
    });
  }

  return questions.slice(0, count);
}

// ─── Extraction Helpers ─────────────────────────────────

/**
 * Pull existing multiple-choice questions out of pasted material, including
 * their answers.
 *
 * This used to hardcode correctAnswer "0" for every question and pad short
 * option lists with "Option C"/"Option D" placeholders — so every extracted
 * quiz marked option A correct and could not be graded. Now the answer is read
 * from the document ("Answer: B", "Ans. (c)", or a ticked option) and a
 * question with no determinable answer is skipped instead of being graded
 * wrongly (stats.skipped counts those).
 */
export function extractExistingQuestions(
  materialText: string,
  maxCount: number,
  stats?: { skipped: number; pending?: PendingQuestion[] }
): unknown[] {
  const questions: unknown[] = [];
  const lines = materialText
    .replace(/\*\*|__/g, "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // "A. text", "a) text", "(C) text"
  const optionRe = /^(?:\(([A-Da-d])\)|([A-Da-d])[.)])\s*(.+)$/;
  // "Answer: B", "Ans. (c)", "Correct answer - d"
  const answerRe = /^(?:correct\s+)?(?:answer|ans)\b\s*[:.\-]?\s*\(?([A-Da-d])\)?\b/i;
  const isQuestionStart = (l: string) => /^\d+[.)\]]\s*\S/.test(l) || /\?\s*$/.test(l);
  // A trailing tick/asterisk marks the keyed option: "c) Glucose ✓"
  const isMarked = (l: string) => /[*\u2713\u2714]+\s*$/.test(l);

  let i = 0;
  while (i < lines.length && questions.length < maxCount) {
    const line = lines[i];
    if (!isQuestionStart(line)) {
      i++;
      continue;
    }

    const qText = line
      .replace(/^\d+[.)\]]\s*/, "")
      .replace(/\s*[*\u2713\u2714]+$/, "")
      .trim();
    if (qText.length < 8) {
      i++;
      continue;
    }

    const options: string[] = [];
    let markedIdx = -1;
    let answerLetter = "";
    let j = i + 1;

    while (j < lines.length && j <= i + 14) {
      const next = lines[j];
      const opt = next.match(optionRe);
      if (opt) {
        const text = opt[3].replace(/\s*[*\u2713\u2714]+$/, "").trim();
        if (text) {
          options.push(text);
          if (isMarked(next)) markedIdx = options.length - 1;
        }
        j++;
        continue;
      }
      const ans = next.match(answerRe);
      if (ans) {
        answerLetter = ans[1];
        break;
      }
      if (isQuestionStart(next)) break;
      j++;
    }

    // The answer line often sits just below the option block.
    if (!answerLetter) {
      for (let k = j; k < lines.length && k <= j + 2; k++) {
        const ans = lines[k].match(answerRe);
        if (ans) {
          answerLetter = ans[1];
          break;
        }
        if (isQuestionStart(lines[k])) break;
      }
    }

    const letterIdx = answerLetter
      ? answerLetter.toUpperCase().charCodeAt(0) - 65
      : -1;
    const correctIdx =
      letterIdx >= 0 && letterIdx < options.length ? letterIdx : markedIdx;

    if (correctIdx >= 0 && correctIdx < options.length) {
      questions.push({
        type: "multiple_choice",
        question: qText.endsWith("?") ? qText : `${qText}?`,
        options,
        correctAnswer: String(correctIdx),
        answerKey: options[correctIdx],
        explanation: "Extracted from the uploaded study document.",
        topic: "Document Questions",
        difficulty: "medium",
      });
    } else if (stats) {
      // No answer stated (and no ticked option). Collect it for answer
      // completion instead of discarding a real question from the document.
      stats.skipped += 1;
      stats.pending?.push({
        question: qText.endsWith("?") ? qText : `${qText}?`,
        options,
      });
    }

    i = Math.max(i + 1, j);
  }

  return questions;
}

function detectSubject(text: string): string {
  const lower = text.toLowerCase();
  if (/cell|organ|bio|dna|protein|gene|membrane/.test(lower)) return "Biology";
  if (/atom|molecule|reaction|acid|bond|compound/.test(lower)) return "Chemistry";
  if (/force|energy|velocity|gravity|mass|quantum/.test(lower)) return "Physics";
  if (/equation|integral|derivative|theorem|matrix/.test(lower)) return "Mathematics";
  if (/war|century|empire|revolution|dynasty|king/.test(lower)) return "History";
  if (/algorithm|data|database|network|compiler/.test(lower)) return "Computer Science";
  return "General Studies";
}

function findDefinitions(text: string): Definition[] {
  const defs: Definition[] = [];
  const regex = /([A-Z][a-zA-Z\s]{2,40})\s+(?:is defined as|refers to|is the|means)\s+([^.!?]{15,180})[.!?]/g;
  let m;
  while ((m = regex.exec(text)) !== null && defs.length < 10) {
    defs.push({ term: m[1].trim(), definition: m[2].trim(), context: "Document definition" });
  }
  return defs;
}

function findProcesses(text: string): Process[] {
  const procs: Process[] = [];
  const regex = /(?:process|mechanism|cycle)\s+of\s+([A-Za-z\s]{3,50})/gi;
  let m;
  while ((m = regex.exec(text)) !== null && procs.length < 5) {
    procs.push({ name: m[1].trim(), steps: ["Initiation", "Execution", "Completion"], purpose: "Described in text" });
  }
  return procs;
}

function extractRelationships(sentences: string[]): Relationship[] {
  const rels: Relationship[] = [];
  for (const s of sentences) {
    const m = s.match(/([A-Z][a-zA-Z\s]{2,30})\s+(causes|leads to|results in|inhibits|regulates)\s+([^.!?]{5,50})/i);
    if (m && rels.length < 10) {
      rels.push({ subject: m[1].trim(), relation: m[2].trim(), object: m[3].trim() });
    }
  }
  return rels;
}

function extractMainTopic(sentence: string): string {
  const words = sentence.split(/\s+/).filter((w) => w.length > 3);
  return words.slice(0, 4).join(" ") || "Core Topic";
}
