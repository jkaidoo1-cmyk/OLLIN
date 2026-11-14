import { NextRequest, NextResponse } from "next/server";
import { analyzeAndGenerate, extractFromExam, extractExistingQuestions } from "@/lib/ai/content-analyzer";
import { extractTextFromBase64, getRelevantText } from "@/lib/file-extract";
import { getSessionUser } from "@/lib/session";
import { checkThrottle } from "@/lib/rate-limit";
import { recordAdminAction } from "@/lib/audit";
import { keepAliveResponse } from "@/lib/keep-alive";

// Generation plus an optional top-up call has to fit in the host's function
// budget; the internal deadline below is set just inside it.
export const maxDuration = 60;

/**
 * The host drops a response that stays silent for more than a few seconds, and
 * generation takes 5-50s, so every answer goes out through the keep-alive
 * stream instead of a bare JSON body. The work itself is unchanged.
 */
export async function POST(request: NextRequest) {
  return keepAliveResponse(() => handle(request));
}

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

/** Fisher–Yates: a real shuffle, so position carries no information. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function handle(request: NextRequest) {
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
        onUsage: async ({ keyId, inputTokens, outputTokens }) => {
          // Awaited: a fire-and-forget write is dropped when a serverless
          // instance freezes right after the response is sent.
          try {
            const { recordKeyUsage } = await import("@/lib/ai/key-rotation");
            await recordKeyUsage(keyId, inputTokens, outputTokens);
          } catch { /* non-critical */ }
        },
      });

      const normalizedExamQuestions = (questions as Record<string, unknown>[])
        .filter((q) => q.question)
        .map((q) => {
          let type = String(q.type || "multiple_choice");
          const options = Array.isArray(q.options) ? q.options.map(String) : undefined;
          // correctAnswer must be a zero-based index (server stores answers as an
          // index); answerKey keeps the option's exact text because that is the
          // ground truth the submit/grading and the post-quiz answer key both need.
          let correctAnswer = normalizeAnswerKey(type, q.correctAnswer, options);
          // A model answering an optionless question returns text rather than
          // an index. Keep that question as a short answer instead of dropping
          // it — the whole point is a complete set.
          const rawAnswer = String(q.correctAnswer ?? "").trim();
          if (!correctAnswer && rawAnswer && (!options || options.length < 2)) {
            type = "short_answer";
            correctAnswer = rawAnswer;
          }
          const resolvedIdx = Number(correctAnswer);
          const answerKey = typeof q.answerKey === "string" && q.answerKey.trim()
            ? q.answerKey.trim()
            : Number.isInteger(resolvedIdx) && options
              ? options[resolvedIdx] ?? ""
              // true/false keys are "true"/"false", not an option index.
              : correctAnswer;
          return {
            ...q,
            type,
            correctAnswer,
            answerKey,
          };
        })
        .filter((q) => q.correctAnswer !== "");

      await recordAdminAction(
        request,
        session,
        "quiz.extract",
        "quiz",
        null,
        `Extracted ${normalizedExamQuestions.length} questions from ${file_name || material_text?.slice(0, 32) || "exam upload"}`
      );

      return NextResponse.json({
        analysis,
        questions: normalizedExamQuestions,
        // Questions the model returned without a resolvable answer are dropped
        // rather than stored with a guessed key — report how many.
        dropped: Math.max(0, (questions as Record<string, unknown>[]).filter((q) => q.question).length - normalizedExamQuestions.length),
      });
    }

    // Extract existing questions mode (regex-based, no AI)
    if (mode === "extract") {
      if (!hasText) {
        return NextResponse.json(
          { error: "Extract mode requires pasted text, not a file. Please paste your material instead." },
          { status: 400 }
        );
      }
      const limit = Math.min(question_count, 50);
      const stats: { skipped: number; pending: Array<{ question: string; options?: string[] }> } = {
        skipped: 0,
        pending: [],
      };
      const extracted = extractExistingQuestions(material_text, limit, stats);

      // Questions whose answer the document never states are SOLVED, not
      // thrown away: an uploaded worksheet without a key should still become a
      // full, gradeable quiz (the model also writes options when none exist).
      let completed: unknown[] = [];
      let completionError = "";
      if (stats.pending.length > 0) {
        try {
          const { completeQuestions } = await import("@/lib/ai/content-analyzer");
          completed = await completeQuestions(stats.pending, material_text, {
            onUsage: async ({ keyId, inputTokens, outputTokens }) => {
              import("@/lib/ai/key-rotation").then(({ recordKeyUsage }) =>
                recordKeyUsage(keyId, inputTokens, outputTokens)
              ).catch(() => { /* non-critical */ });
            },
          });
        } catch (err) {
          completionError = err instanceof Error ? err.message : "Could not fill in the missing answers.";
        }
      }

      const questions = [...extracted, ...completed].slice(0, limit);
      const unresolved = stats.pending.length - completed.length;
      const completedNote = completed.length > 0
        ? ` ${completed.length} question${completed.length === 1 ? "" : "s"} had no stated answer and ${completed.length === 1 ? "was" : "were"} solved automatically.`
        : "";
      const unresolvedNote = unresolved > 0
        ? ` ${unresolved} question${unresolved === 1 ? "" : "s"} could not be completed${completionError ? ` (${completionError})` : ""}.`
        : "";

      return NextResponse.json({
        questions,
        completed: completed.length,
        skipped: unresolved,
        analysis: {
          title: "Extracted Questions",
          subject: "Extracted Content",
          summary: `Found ${questions.length} questions in the document.${completedNote}${unresolvedNote}`,
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
    const wanted = Math.min(question_count, 200);
    // The host kills this function around 60s, so everything — including the
    // top-up call — has to finish inside a budget we control, or the user gets
    // no response at all.
    const deadlineAt = Date.now() + 50_000;

    // Record per-key usage so the admin's token charts stay accurate. Awaited:
    // a fire-and-forget write is dropped when a serverless instance freezes
    // right after the response is sent.
    const recordUsage = async ({
      keyId,
      inputTokens,
      outputTokens,
    }: {
      keyId: string;
      inputTokens: number;
      outputTokens: number;
    }) => {
      try {
        const { recordKeyUsage } = await import("@/lib/ai/key-rotation");
        await recordKeyUsage(keyId, inputTokens, outputTokens);
      } catch { /* non-critical */ }
    };

    const { analysis, questions } = await analyzeAndGenerate(
      finalText,
      wanted,
      question_types,
      {
        fileData: isImage ? file_data : undefined,
        fileType: isImage ? file_type : undefined,
        fileName: isImage ? file_name : undefined,
        customInstructions: custom_instructions,
        deadlineAt,
        onUsage: recordUsage,
      }
    );

    const acceptBatch = (batch: unknown[], subject: string) =>
      (batch as Record<string, unknown>[])
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
          topic: String(q.topic || subject || "General"),
          difficulty: ["easy", "medium", "hard"].includes(q.difficulty as string)
            ? q.difficulty
            : "medium",
        };
      })
      .filter((q) => q.correctAnswer !== "");

    // Deterministic quality gate: the prompt states the standard, this enforces
    // the part of it a script can check (banned stems, bogus options, repeats).
    const { filterLowQuality } = await import("@/lib/ai/quality");
    // Shared across batches so a top-up cannot re-ask an earlier question.
    const stemSeen = new Set<string>();
    const dropped: { question: string; reason: string }[] = [];

    const gate = (batch: unknown[]) => {
      const { kept, dropped: rejected } = filterLowQuality(
        acceptBatch(batch, analysis.subject),
        stemSeen
      );
      dropped.push(...rejected);
      return kept;
    };

    let qualityChecked = gate(questions);

    // A rejected item must not silently shrink the quiz: ask once more for the
    // shortfall, naming the points already covered so the retry adds new ones
    // rather than rewrites of what survived.
    if (qualityChecked.length < wanted && Date.now() < deadlineAt - 12_000) {
      const shortfall = wanted - qualityChecked.length;
      const covered = qualityChecked
        .slice(-12)
        .map((q) => `- ${q.question}`)
        .join("\n");
      try {
        const retry = await analyzeAndGenerate(
          finalText,
          Math.min(shortfall + 2, 50),
          question_types,
          {
            fileName: isImage ? file_name : undefined,
            deadlineAt,
            customInstructions: [
              custom_instructions,
              covered
                ? `These points are already covered — write different questions:\n${covered}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            onUsage: recordUsage,
          }
        );
        qualityChecked = [...qualityChecked, ...gate(retry.questions)];
      } catch (err) {
        // A failed top-up is not a failed quiz: keep what passed the gate and
        // report the real count in the response below.
        console.error("[generate] top-up failed:", err instanceof Error ? err.message : err);
      }
      qualityChecked = qualityChecked.slice(0, wanted);
    }

    // ── True/false balance ───────────────────────────────────
    // Models drift hard towards true statements (32 of the 33 stored true/false
    // items were keyed "true"), and a set of all-true items can be answered
    // without reading. A statement cannot simply be re-keyed — that would make
    // the answer wrong — so the missing side is requested explicitly and a
    // surplus item from the other side is dropped in its place.
    const tfItems = qualityChecked.filter((q) => q.type === "true_false");
    if (tfItems.length >= 2 && Date.now() < deadlineAt - 15_000) {
      const wantFalse = Math.ceil(tfItems.length / 2);
      const haveFalse = tfItems.filter((q) => q.correctAnswer === "false").length;
      if (haveFalse < wantFalse) {
        const need = wantFalse - haveFalse;
        const covered = qualityChecked
          .slice(-12)
          .map((q) => `- ${q.question}`)
          .join("\n");
        try {
          const retry = await analyzeAndGenerate(finalText, need, ["true_false"], {
            fileName: isImage ? file_name : undefined,
            deadlineAt,
            customInstructions: [
              custom_instructions,
              `Write only statements that are FALSE — claims the material clearly contradicts. Do not negate a true statement and do not write anything that is actually correct. Every item's correctAnswer must be "false".`,
              covered ? `These points are already covered — write different ones:\n${covered}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            onUsage: recordUsage,
          });
          const added = gate(retry.questions).filter(
            (q) => q.type === "true_false" && q.correctAnswer === "false"
          );
          if (added.length > 0) {
            // Keep the count the same: each new false item replaces a true one.
            let toRemove = Math.min(need, added.length);
            qualityChecked = [
              ...added.slice(0, toRemove),
              ...qualityChecked.filter((q) => {
                if (toRemove > 0 && q.type === "true_false" && q.correctAnswer !== "false") {
                  toRemove--;
                  return false;
                }
                return true;
              }),
            ];
          }
        } catch (err) {
          // A failed balancing pass must not lose the quiz: keep what passed.
          console.error(
            "[generate] true/false balancing failed:",
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    if (dropped.length > 0) {
      console.warn(
        `[generate] dropped ${dropped.length} low-quality items (kept ${qualityChecked.length}/${wanted})`,
        dropped.slice(0, 5)
      );
    }

    // ── Option order ─────────────────────────────────────────
    // The model has a slot habit: 22 of the 36 stored multiple-choice keys sat
    // at index 1 and only 2 at index 3, so "always pick B" scored over half.
    // The flag says options are shuffled, but nothing ever did it — do it here,
    // on the stored data, and re-point the key at the option it names.
    qualityChecked = qualityChecked.map((q) => {
      if (q.type !== "multiple_choice" || !Array.isArray(q.options) || q.options.length < 2) {
        return q;
      }
      const correctText = q.options[Number(q.correctAnswer)];
      if (correctText === undefined) return q;
      const order = shuffled(q.options);
      return { ...q, options: order, correctAnswer: String(order.indexOf(correctText)) };
    });

    const tfFinal = qualityChecked.filter((q) => q.type === "true_false");
    if (tfFinal.length > 0) {
      const falseCount = tfFinal.filter((q) => q.correctAnswer === "false").length;
      if (falseCount === 0 && tfFinal.length > 1) {
        console.warn(`[generate] true/false set is all-true (${tfFinal.length} items)`);
      }
    }

    if (qualityChecked.length === 0) {
      return NextResponse.json(
        { error: "Could not generate questions from this material. Please try different content." },
        { status: 422 }
      );
    }

    await recordAdminAction(
      request,
      session,
      "quiz.generate",
      "quiz",
      null,
      `Generated ${qualityChecked.length} ${question_types.join(", ")} questions from material`
    );

    return NextResponse.json({
      questions: qualityChecked,
      // The client reports these so a short quiz is never a silent surprise.
      requested: wanted,
      generated: qualityChecked.length,
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
