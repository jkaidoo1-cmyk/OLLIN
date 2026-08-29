import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import PDFParser from "pdf2json";

function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();

    parser.on("pdfParser_dataError", (err: unknown) => {
      reject(new Error(String(err instanceof Error ? err.message : err)));
    });

    parser.on("pdfParser_dataReady", (data: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      let text = "";
      const pageCount = data.Pages?.length || 0;

      for (const page of data.Pages || []) {
        for (const textObj of page.Texts || []) {
          for (const run of textObj.R || []) {
            text += decodeURIComponent(run.T || "") + " ";
          }
          text += "\n";
        }
      }

      resolve({ text: text.trim(), pageCount });
    });

    parser.parseBuffer(buffer);
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const fileType = file.type;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";
    let fileTypeLabel = "unknown";

    // ─── PDF ─────────────────────────────────────────
    if (fileName.endsWith(".pdf") || fileType === "application/pdf") {
      fileTypeLabel = "pdf";
      try {
        const result = await extractTextFromPdf(buffer);
        extractedText = result.text;

        if (!extractedText || extractedText.trim().length < 10) {
          return NextResponse.json({
            text: "",
            fileType: "pdf",
            warning:
              "This PDF appears to be image-based or has no extractable text. " +
              "Try copying and pasting the content directly, or upload a text-based PDF.",
            pageCount: result.pageCount,
            charCount: 0,
          });
        }
      } catch (pdfError) {
        console.error("PDF parse error:", pdfError);
        return NextResponse.json(
          { error: "Failed to parse PDF. The file may be corrupted or password-protected." },
          { status: 422 }
        );
      }
    }

    // ─── DOCX ────────────────────────────────────────
    else if (
      fileName.endsWith(".docx") ||
      fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      fileTypeLabel = "docx";
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch (docxError) {
        console.error("DOCX parse error:", docxError);
        return NextResponse.json(
          { error: "Failed to parse DOCX file. It may be corrupted or an older .doc format." },
          { status: 422 }
        );
      }
    }

    // ─── DOC (old format) ────────────────────────────
    else if (fileName.endsWith(".doc") || fileType === "application/msword") {
      fileTypeLabel = "doc";
      return NextResponse.json(
        {
          error:
            "Legacy .doc format is not supported directly. " +
            "Please save the file as .docx or .txt and try again, or paste the text content directly.",
        },
        { status: 422 }
      );
    }

    // ─── TXT / Plain text ────────────────────────────
    else if (
      fileName.endsWith(".txt") ||
      fileType === "text/plain" ||
      fileType.startsWith("text/")
    ) {
      fileTypeLabel = "txt";
      extractedText = buffer.toString("utf-8");
    }

    // ─── Images ──────────────────────────────────────
    else if (
      fileType.startsWith("image/") ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".webp")
    ) {
      fileTypeLabel = "image";
      return NextResponse.json({
        text: "",
        fileType: "image",
        warning:
          "Image text extraction (OCR) requires additional setup. " +
          "For now, please paste the text content from this image directly.",
        charCount: 0,
      });
    }

    // ─── Unsupported ─────────────────────────────────
    else {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${fileType || fileName}. Supported formats: PDF, DOCX, TXT`,
        },
        { status: 422 }
      );
    }

    const cleanedText = cleanExtractedText(extractedText);

    if (cleanedText.trim().length < 10) {
      return NextResponse.json({
        text: "",
        fileType: fileTypeLabel,
        warning: "Could not extract meaningful text from this file. Try a different file or paste the content directly.",
        charCount: 0,
      });
    }

    return NextResponse.json({
      text: cleanedText,
      fileType: fileTypeLabel,
      charCount: cleanedText.length,
      wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
      fileName: file.name,
    });
  } catch (error) {
    console.error("Text extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract text from the file. Please try again." },
      { status: 500 }
    );
  }
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
