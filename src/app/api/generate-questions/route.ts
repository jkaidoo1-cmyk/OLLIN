import { NextRequest, NextResponse } from "next/server";
import { analyzeAndGenerate, extractFromExam, extractExistingQuestions } from "@/lib/ai/content-analyzer";
import { extractTextFromBase64, getRelevantText } from "@/lib/file-extract";
import { getSessionUser } from "@/lib/session";
import { checkThrottle } from "@/lib/rate-limit";

/**
 * The app stores a multiple-choice answer as the option's zero-based index
 * ("0".."3") and a true/false answer as "true"/"false". Models sometimes
 * return the option text instead (exam extraction always does), which would
 * mark every participant wrong. Normalize every answer key here and reject
 * questions whose answer can't be resolved.
 */
function normalizeAnswerKey(
  type: string,
  rawAnswer: unknown,
  options?: string[]
): string {
  const raw = String(rawAnswer ?? "").trim();
  if (!raw) return "";

  const opts = options || [];
  const loose = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (type === "short_answer" || type === "fill_blank") return raw;

  if (type === "true_false" || /^(true|false)$/i.test(raw)) {
    const lower = raw.toLowerCase();
    if (lower.startsWith("t")) return "true";
    if (lower.startsWith("f")) return "false";
    const idx = Number(raw);
    if (idx === 0) return "true";
    if (idx === 1) return "false";
    return "";
  }

  if (/^\d+$/.test(raw)) {
    const idx = Number(raw);
    if (opts.length === 0 || (idx >= 0 && idx < opts.length)) return String(idx);
    return "";
  }

  // "A", "B)", "Option C", "answer: d"
  const letter = raw.match(/^(?:option\s*)?([A-Za-z])\b/i);
  if (letter && opts.length > 0) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < opts.length) return String(idx);
  }

  // The correct option's text (exact or formatting-insensitive match).
  if (opts.length > 0) {
    let idx = opts.findIndex((o) => o.trim().toLowerCase() === raw.toLowerCase());
    if (idx < 0) idx = opts.findIndex((o) => loose(o) === loose(raw));
    if (idx >= 0) return String(idx);
  }

  return "";
}

export async function POST(request: NextRequest) {
  try {
    // AI calls spend real money/tokens — only logged-in users may trigger
    // them, and abusive request rates are throttled per IP.
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Please log in to generate questions." },
        { status: 401 }
      );
    }
    const limit = checkThrottle(request, "generate", 10, 60_000);
    if (limit.blocked) {
      return NextResponse.json(
        { error: limit.message },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const body = await request.json();
    const {
      material_text,
      file_data,
      file_type,
      file_name,
      question_count = 10,
      question_types = ["multiple_choice"],
      mode = "generate",
      custom_instructions,
    } = body;

    // Check that we have either text or a file
    const hasText = material_text && material_text.trim().length >= 10;
    const hasFile = file_data && file_type;

    if (!hasText && !hasFile) {
      return NextResponse.json(
        { error: "Please provide learning material (text or file) for analysis." },
        { status: 400 }
      );
    }

    // ── Exam extraction mode: the upload IS the quiz ──────────
    // The user uploaded an existing exam/test. Copy its questions verbatim,
    // determine the answers — do NOT generate new questions.
    if (mode === "exam") {
      const hasExamFile = file_data && file_type;
      if (!hasText && !hasExamFile) {
        return NextResponse.json(
          { error: "Please upload or paste the exam paper to extract." },
          { status: 400 }
        );
      }

      let examText = hasText ? material_text : "";
      let isImage = false;
      if (hasExamFile && file_type.startsWith("image/")) {
        isImage = true; // vision-capable provider reads the image directly
      } else if (hasExamFile) {
        const extracted = await extractTextFromBase64(file_data, file_type, file_name);
        if (extracted.error && !extracted.text) {
          return NextResponse.json({ error: extracted.error }, { status: 400 });
        }
        if (!extracted.text || extracted.text.trim().length < 20) {
          return NextResponse.json(
            { error: "Could not read enough content from this file. It may be empty, image-based, or password-protected. Try pasting the text instead." },
            { status: 400 }
          );
        }
        examText = extracted.text;
      }

      const { analysis, questions } = await extractFromExam(examText, {
        fileData: isImage ? file_data : undefined,
        fileType: isImage ? file_type : undefined,
        fileName: isImage ? file_name : undefined,
        customInstructions: custom_instructions,
        onUsage: ({ keyId, inputTokens, outputTokens }) => {
          import("@/lib/ai/key-rotation").then(({ recordKeyUsage }) =>
            recordKeyUsage(keyId, inputTokens, outputTokens)
          ).catch(() => { /* non-critical */ });
        },
      });

      const normalizedExamQuestions = (questions as Record<string, unknown>[])
        .filter((q) => q.question)
        .map((q) => {
          const type = String(q.type || "multiple_choice");
          const options = Array.isArray(q.options) ? q.options.map(String) : undefined;
          // correctAnswer must be a zero-based index (server stores answers as an
          // index); answerKey keeps the option's exact text because that is the
          // ground truth the submit/grading and the post-quiz answer key both need.
          const correctAnswer = normalizeAnswerKey(type, q.correctAnswer, options);
          const answerKey = typeof q.answerKey === "string" && q.answerKey.trim()
            ? q.answerKey.trim()
            : options?.[Number(correctAnswer)] ?? "";
          return {
            ...q,
            type,
            correctAnswer,
            answerKey,
          };
        })
        .filter((q) => q.correctAnswer !== "");

      return NextResponse.json({ analysis, questions: normalizedExamQuestions });
    }

    // Extract existing questions mode (regex-based, no AI)
    if (mode === "extract") {
      if (!hasText) {
        return NextResponse.json(
          { error: "Extract mode requires pasted text, not a file. Please paste your material instead." },
          { status: 400 }
        );
      }
      const extracted = extractExistingQuestions(material_text, Math.min(question_count, 50));
      return NextResponse.json({
        questions: extracted,
        analysis: {
          title: "Extracted Questions",
          subject: "Extracted Content",
          summary: `Found ${extracted.length} questions directly inside the document.`,
          conceptsFound: 0,
          factsFound: 0,
          definitionsFound: 0,
        },
      });
    }

    // If a file was uploaded, extract its text first
    let finalText = hasText ? material_text : "";
    let isImage = false;

    if (hasFile) {
      const isImageType = file_type.startsWith("image/");

      if (isImageType) {
        isImage = true;
      } else {
        const extracted = await extractTextFromBase64(file_data, file_type, file_name);

        if (extracted.error && !extracted.text) {
          return NextResponse.json(
            { error: extracted.error },
            { status: 400 }
          );
        }

        if (!extracted.text || extracted.text.trim().length < 20) {
          return NextResponse.json(
            { error: "Could not read enough content from this file. It may be empty, image-based, or password-protected. Try pasting the text instead." },
            { status: 400 }
          );
        }

        finalText = extracted.text;
      }
    }

    finalText = getRelevantText(finalText, 7000);

    // Call AI — keys come from the server only (Supabase / config file / env).
    const { analysis, questions } = await analyzeAndGenerate(
      finalText,
      Math.min(question_count, 200),
      question_types,
      {
        fileData: isImage ? file_data : undefined,
        fileType: isImage ? file_type : undefined,
        fileName: isImage ? file_name : undefined,
        customInstructions: custom_instructions,
        onUsage: ({ keyId, inputTokens, outputTokens }) => {
          // Record per-key usage so the admin's token charts stay accurate.
          import("@/lib/ai/key-rotation").then(({ recordKeyUsage }) =>
            recordKeyUsage(keyId, inputTokens, outputTokens)
          ).catch(() => { /* non-critical */ });
        },
      }
    );

    const validatedQuestions = (questions as Record<string, unknown>[])
      .filter((q) => q.question && q.correctAnswer !== undefined)
      .map((q) => {
        const isTF = q.type === "true_false";
        let rawOptions = Array.isArray(q.options) ? q.options.map(String) : undefined;

        if (isTF && (!rawOptions || rawOptions.length !== 2)) {
          rawOptions = ["True", "False"];
        }

        const type = String(
          question_types.includes(q.type as string) ? q.type : question_types[0]
        ) as string;

        return {
          type,
          question: String(q.question || ""),
          options: rawOptions,
          correctAnswer: normalizeAnswerKey(type, q.correctAnswer, rawOptions),
          explanation: String(q.explanation || "Based on the provided material."),
          topic: String(q.topic || analysis.subject || "General"),
          difficulty: ["easy", "medium", "hard"].includes(q.difficulty as string)
            ? q.difficulty
            : "medium",
        };
      })
      .filter((q) => q.correctAnswer !== "");

    if (validatedQuestions.length === 0) {
      return NextResponse.json(
        { error: "Could not generate questions from this material. Please try different content." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      questions: validatedQuestions,
      analysis: {
        title: analysis.title,
        subject: analysis.subject,
        summary: analysis.summary,
        conceptsFound: analysis.keyConcepts?.length || 0,
        factsFound: analysis.facts?.length || 0,
        definitionsFound: analysis.definitions?.length || 0,
      },
    });
  } catch (error) {
    console.error("Question generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while generating questions. Please try again.",
      },
      { status: 500 }
    );
  }
}
