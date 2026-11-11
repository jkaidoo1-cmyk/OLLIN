/**
 * Server-side file text extraction.
 * Converts base64-encoded files into plain text for AI processing.
 */

import { join } from "path";

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  error?: string;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Extract text from a base64-encoded file.
 * Supports: PDF, DOCX, TXT
 */
export async function extractTextFromBase64(
  base64Data: string,
  fileType: string,
  fileName: string
): Promise<ExtractionResult> {
  // Size check
  const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      text: "",
      error: `File is too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
    };
  }

  const buffer = Buffer.from(base64Data, "base64");

  try {
    if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      return await extractPDF(buffer);
    }

    if (
      fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileType === "application/msword" ||
      fileName.toLowerCase().endsWith(".docx") ||
      fileName.toLowerCase().endsWith(".doc")
    ) {
      return await extractDOCX(buffer);
    }

    if (fileType === "text/plain" || fileName.toLowerCase().endsWith(".txt")) {
      return { text: buffer.toString("utf-8") };
    }

    return {
      text: "",
      error: `Unsupported file type: ${fileType || fileName}. Please use PDF, DOCX, or TXT.`,
    };
  } catch (err) {
    return {
      text: "",
      error: `Failed to read ${fileName}: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Extract text from a PDF buffer using pdfjs-dist.
 *
 * pdf2json rejected perfectly valid PDFs with "Invalid XRef stream header"
 * (cross-reference streams, which pdf-lib and modern Word/LaTeX exports emit),
 * so every PDF upload failed. pdfjs-dist reads the same files and is the
 * parser browsers themselves use.
 */
async function extractPDF(buffer: Buffer): Promise<ExtractionResult> {
  // Load the parser from node_modules at RUNTIME. A plain dynamic import gets
  // rewritten into a bundled chunk, and pdf.js then looks for its worker next
  // to that chunk ("Setting up fake worker failed: Cannot find module
  // .../.next/dev/server/chunks/..."). Requiring the real file keeps
  // import.meta.url inside node_modules, where pdf.worker.mjs actually lives.
  const { createRequire } = await import("node:module");
  const nodeRequire = createRequire(join(process.cwd(), "package.json"));
  const pdfjs = nodeRequire("pdfjs-dist/legacy/build/pdf.mjs") as unknown as {
    getDocument: (src: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{
            items: Array<{ str?: string; hasEOL?: boolean }>;
          }>;
          cleanup: () => void;
        }>;
      }>;
      // destroy() releases the worker/transport and lives on the LOADING TASK,
      // not on the document proxy.
      destroy: () => Promise<void>;
    };
  };

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;

  try {
    const out: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        line += item.str;
        // hasEOL marks the end of a visual line; otherwise keep words apart.
        if (item.hasEOL) {
          out.push(line);
          line = "";
        } else {
          line += " ";
        }
      }
      if (line.trim()) out.push(line);
      out.push("");
      page.cleanup();
    }

    const pageCount = doc.numPages;
    const text = compressText(out.join("\n"));
    if (!text.trim()) {
      return {
        text: "",
        pageCount,
        error:
          "This PDF has no selectable text (it may be a scan or an image export). Try pasting the text instead.",
      };
    }
    return { text, pageCount };
  } finally {
    await Promise.resolve()
      .then(() => loadingTask.destroy())
      .catch(() => { /* transport already closed */ });
  }
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
async function extractDOCX(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: compressText(result.value),
    error: result.messages.length > 0 ? result.messages.map((m) => String(m)).join("; ") : undefined,
  };
}

// ─── Text Compression ─────────────────────────────────
// Cleans and reduces text to save tokens before sending to AI.
// Removes noise, deduplicates, and keeps only meaningful content.

function compressText(text: string): string {
  if (!text) return "";

  let t = text;

  // 1. Remove common PDF/DOCX artifacts
  t = t.replace(/\r\n/g, "\n");                       // normalize line endings
  t = t.replace(/\t/g, " ");                            // tabs to spaces
  t = t.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");  // zero-width chars
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // control chars

  // 2. Remove page headers/footers and page numbers
  t = t.replace(/^\s*page\s+\d+\s*(of\s+\d+)?\s*$/gim, "");
  t = t.replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, "");         // 1/10
  t = t.replace(/^\s*\d+\s*$/gm, "");                      // standalone numbers
  t = t.replace(/^\s*chapter\s+\d+/gim, (m) => m.trim()); // keep chapter titles
  t = t.replace(/^\s*(copyright|all rights reserved|confidential).*$/gim, "");

  // 3. Collapse multiple blank lines and spaces
  t = t.replace(/\n{3,}/g, "\n\n");                     // max 2 newlines
  t = t.replace(/ {2,}/g, " ");                            // multiple spaces

  // 4. Collapse runs of identical lines (PDF parsers repeat overlay text).
  //    Only CONSECUTIVE duplicates: option lines like "True" or "None of the
  //    above" legitimately repeat across questions, and a global dedupe
  //    deleted them from every question after the first, corrupting the
  //    options of later questions.
  const lines = t.split("\n");
  const uniqueLines: string[] = [];
  let prevKey = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) {
      uniqueLines.push(line);
      prevKey = "";
      continue;
    }
    const key = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
    if (key === prevKey) continue;
    prevKey = key;
    uniqueLines.push(line);
  }
  t = uniqueLines.join("\n");

  // 5. Remove lines that are just formatting noise
  t = t.replace(/^[-_=*]{3,}$/gm, "");                   // --- or === dividers
  t = t.replace(/^[•·▪▸►→\-]{2,}\s*$/gm, "");           // bullet-only lines
  t = t.replace(/^[\.\.\.]{3,}$/gm, "");                // ... dots

  // 6. Trim final output
  t = t.trim();

  return t;
}

/**
 * Get the most relevant portion of text for question generation.
 * Prioritizes content density over raw length.
 */
export function getRelevantText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Try to cut at sentence boundaries
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastQuestion = truncated.lastIndexOf("?");
  const lastExcl = truncated.lastIndexOf("!");
  const lastSentence = Math.max(lastPeriod, lastQuestion, lastExcl);

  if (lastSentence > maxChars * 0.7) {
    return truncated.slice(0, lastSentence + 1);
  }

  return truncated;
}
