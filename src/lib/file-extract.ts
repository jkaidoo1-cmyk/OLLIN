/**
 * Server-side file text extraction.
 * Converts base64-encoded files into plain text for AI processing.
 */

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
 * Extract text from a PDF buffer using pdf2json.
 */
async function extractPDF(buffer: Buffer): Promise<ExtractionResult> {
  const PDFParser = (await import("pdf2json")).default;
  const parser = new PDFParser();

  return new Promise((resolve) => {
    parser.on("pdfParser_dataError", (errData: { parserError: Error } | Error) => {
      const msg = errData instanceof Error ? errData.message : String(errData.parserError);
      resolve({ text: "", error: `PDF parse error: ${msg}` });
    });

    parser.on("pdfParser_dataReady", (pdfData: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      const pages = pdfData.Pages || [];
      let text = "";

      for (const page of pages) {
        const texts = page.Texts || [];
        for (const t of texts) {
          const runs = t.R || [];
          for (const r of runs) {
            // pdf2json URL-encodes text content
            try {
              text += decodeURIComponent(r.T || "") + " ";
            } catch {
              text += (r.T || "") + " ";
            }
          }
        }
        text += "\n\n";
      }

      resolve({ text: compressText(text), pageCount: pages.length });
    });

    try {
      parser.parseBuffer(buffer);
    } catch (err) {
      resolve({ text: "", error: `PDF parse failed: ${err instanceof Error ? err.message : "Unknown error"}` });
    }
  });
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

  // 4. Remove repeated lines (duplicated content from PDF parsing)
  const lines = t.split("\n");
  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) {
      uniqueLines.push(line);
      continue;
    }
    // Normalize for dedup comparison
    const key = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLines.push(line);
    }
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
