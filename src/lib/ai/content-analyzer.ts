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
}

// ─── API Configuration ────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-3.7-flash";

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

  // Compress and truncate material
  const compressed = compressMaterial(materialText);
  const charLimit = 2000; // ~500 tokens
  const textBlock = compressed.length > 0
    ? compressed.slice(0, charLimit)
    : "Generate general academic questions.";

  const instructionsBlock = customInstructions
    ? `\n\nAdditional instructions: ${customInstructions}`
    : "";

  return `${questionCount} ${typeDesc} questions from this material. Be specific to the content.${instructionsBlock}

Material:
${textBlock}

Rules: Plain text only, no markdown/symbols. Full sentences. Use the question types requested above.

JSON only:
{"title":"","subject":"","questions":[{"type":"multiple_choice","question":"","options":["","","",""],"correctAnswer":"0","explanation":"","topic":"","difficulty":"medium"}]}`;
}

// ─── Main Generation Entry Point ─────────────────────────

export async function analyzeAndGenerate(
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  options: AIOptions = {}
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  // Get all available providers from server-side keys
  const { getAllKeys } = await import("./key-rotation");
  const allKeys = getAllKeys();
  const enabledKeys = allKeys.filter((k) => k.enabled && k.key);

  if (enabledKeys.length === 0) {
    throw new Error("No service configured. Please contact your administrator.");
  }

  // Group keys by provider
  const providers = [...new Set(enabledKeys.map((k) => k.provider))];
  let lastError: Error | null = null;

  for (const p of providers) {
    try {
      const { result } = await tryWithRotation(
        (apiKey) => callAIProvider(p, materialText, questionCount, questionTypes, apiKey, options.fileData, options.fileType, options.fileName, options.customInstructions),
        p
      );
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
  customInstructions?: string
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  if (provider === "gemini") {
    return callGeminiAPI(materialText, questionCount, questionTypes, apiKey, fileData, fileType, fileName, customInstructions);
  }
  return callGroqAPI(materialText, questionCount, questionTypes, apiKey, fileData, fileType, fileName, customInstructions);
}

// ─── Groq API ─────────────────────────────────────────

async function callGroqAPI(
  materialText: string,
  questionCount: number,
  questionTypes: string[],
  apiKey: string,
  fileData?: string,
  fileType?: string,
  fileName?: string,
  customInstructions?: string
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  const prompt = buildDeepAnalysisAndQuestionPrompt(materialText, questionCount, questionTypes, fileName, customInstructions);

  const maxTok = Math.min(4096, 256 + questionCount * 300);
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

  return parseAIJSONResponse(textContent);
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
  customInstructions?: string
): Promise<{ analysis: ContentAnalysis; questions: unknown[] }> {
  const prompt = buildDeepAnalysisAndQuestionPrompt(materialText, questionCount, questionTypes, fileName, customInstructions);

  // Gemini uses OpenAI-compatible endpoint
  const maxTok2 = Math.min(4096, 256 + questionCount * 300);
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [
        { role: "system", content: "Output valid JSON only. No markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: maxTok2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content;    if (!textContent) throw new Error("Empty response from service.");

  return parseAIJSONResponse(textContent);
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

export function extractExistingQuestions(materialText: string, maxCount: number): unknown[] {
  const questions: unknown[] = [];
  const lines = materialText.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  let i = 0;
  while (i < lines.length && questions.length < maxCount) {
    const line = lines[i];
    if (line.includes("?") || /^\d+[.)\]]\s*/.test(line)) {
      const qText = line.replace(/^\d+[.)\]]\s*/, "").trim();
      const options: string[] = [];
      let j = i + 1;

      while (j < lines.length && options.length < 4) {
        if (/^\(?[A-Da-d]\)[.)\s]/.test(lines[j]) || /^[-•]\s*/.test(lines[j])) {
          options.push(lines[j].replace(/^\(?[A-Da-d]\)[.)\s]*/, "").replace(/^[-•]\s*/, "").trim());
        } else if (lines[j].includes("?")) {
          break;
        }
        j++;
      }

      if (options.length >= 2) {
        questions.push({
          type: "multiple_choice",
          question: qText.endsWith("?") ? qText : qText + "?",
          options: options.length >= 4 ? options.slice(0, 4) : [...options, "Option C", "Option D"].slice(0, 4),
          correctAnswer: "0",
          explanation: "Extracted from the uploaded study document.",
          topic: "Document Questions",
          difficulty: "medium",
        });
      }
      i = Math.max(i + 1, j);
    } else {
      i++;
    }
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
