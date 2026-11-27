import { NextRequest, NextResponse } from "next/server";
import { createQuiz, getUserQuizzes, readServerQuizzes, writeServerQuizzes, readServerQuestions, writeServerQuestions } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { isEphemeralHost, isLocalRequest } from "@/lib/server-host";
import { serverError, userError } from "@/lib/api-errors";
import { resolveQuizHostId } from "@/lib/quiz-host";
import { recordAdminAction } from "@/lib/audit";
import { normalizeFigure, normalizePreamble, isMissingOptionalColumn } from "@/lib/question-figure";
import { readVisibleQuizzes, stripQuestionData } from "@/lib/quizzes-list";
import { Quiz, Question } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

// GET — list all quizzes.
// Field-minimized by default (correct answers/explanations never leave the
// server here): the full quiz list is readable by any browser, so each row
// ships only what participants need. Editors fetch the full row for ONE quiz
// via /api/quizzes/[id]?include=answers, which is host/admin-gated.
export async function GET(request: NextRequest) {
  try {
    // The visible set is assembled in one place, so /api/quizzes/delta diffs
    // exactly the list this endpoint returns.
    const quizzes = await readVisibleQuizzes(request);
    if (!quizzes) {
      return NextResponse.json({ error: "Sign in to view quizzes." }, { status: 401 });
    }
    return NextResponse.json({ quizzes: quizzes.map(stripQuestionData) });
  } catch (error) {
    return serverError("quizzes.list", error, {
      message: "We couldn't load your quizzes. Refresh the page and try again.",
    });
  }
}

/**
 * Accept both spellings of a question payload. Clients and the DB schema use
 * snake_case (`question_text`, `correct_answer`); older callers sent the
 * camelCase shape. Reading only one spelling silently stored rows with no
 * text and no answer key — i.e. a quiz that renders blank AND grades every
 * answer wrong.
 */
function normalizeQuestionPayload(q: any, idx: number) {
  return {
    question_text: String(q.question_text ?? q.question ?? "").trim(),
    question_type: (q.question_type ?? q.type ?? "multiple_choice") as Question["question_type"],
    options: q.options ?? null,
    correct_answer: q.correct_answer ?? q.correctAnswer ?? "",
    explanation: q.explanation ?? null,
    topic: q.topic ?? null,
    difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
    marks: q.marks ?? 1,
    order_index: q.order_index ?? idx,
    // Chart data the question refers to (drawn client-side as SVG).
    figure: normalizeFigure(q.figure),
    // Optional passage/case printed above the question.
    preamble: normalizePreamble(q.preamble),
  };
}

// POST — create a new quiz with questions.
// In local mode, the client sends the fully-built quiz (`direct` mode) so it is
// persisted to the server file and is visible from every browser / the admin panel.
// host_id is always derived from the server-side session — a client-supplied
// host_id is ignored, so one student can't claim another teacher's quizzes.
export async function POST(request: NextRequest) {
  try {
    const local = isLocalRequest(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const {
      title,
      description,
      time_limit_minutes,
      questions,
      // Optional scheduling / policy fields. They used to be dropped whenever
      // Supabase was unavailable, so a quiz could be published with no window
      // and no attempt cap at all.
      share_code,
      max_attempts,
      show_answers_after,
      shuffle_questions,
      shuffle_options,
      passing_score,
      starts_at,
      ends_at,
      course_id,
      status,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Quiz title is required" }, { status: 400 });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "At least one question is required" }, { status: 400 });
    }
    if (questions.length > 500) {
      return NextResponse.json({ error: "A quiz can have at most 500 questions" }, { status: 422 });
    }

    // Theory answers are marked against the question's stored model answer, so
    // a theory item without one can never be marked — refuse the save rather
    // than publish a question no student can be scored on fairly.
    const { theorySchemeDefect } = await import("@/lib/ai/quality");
    const schemeDefect = theorySchemeDefect(questions);
    if (schemeDefect) {
      return NextResponse.json(
        {
          error: `Question ${schemeDefect.index + 1} is a theory question, so it needs a model answer of at least a sentence. Every student is marked against it, so it must be written before the quiz is saved.`,
          question_index: schemeDefect.index,
        },
        { status: 422 }
      );
    }

    if (local && body.quiz) {
      // Direct-save path: normalize the client-built quiz before persisting,
      // so a malformed payload can never poison the server file.
      const raw = body.quiz as Partial<Quiz>;
      const session = await getSessionUser(request).catch(() => null);
      if (!session) {
        return NextResponse.json(
          { error: "Please log in to create a quiz." },
          { status: 401 }
        );
      }
      const quizzesNow = readServerQuizzes();
      const quiz: Quiz = {
        id: raw.id || `local-quiz-${Date.now()}`,
        host_id: session.id,
        title: String(raw.title || title).trim() || "Untitled Quiz",
        description: raw.description ?? null,
        share_code: raw.share_code || `OLLIN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        time_limit_minutes: raw.time_limit_minutes ?? null,
        max_attempts: raw.max_attempts ?? 1,
        show_answers_after: raw.show_answers_after || "after_completion",
        shuffle_questions: raw.shuffle_questions ?? true,
        shuffle_options: raw.shuffle_options ?? true,
        passing_score: raw.passing_score ?? 60,
        starts_at: raw.starts_at ?? null,
        ends_at: raw.ends_at ?? null,
        status: raw.status || "published",
        course_id: raw.course_id ?? null,
        material_id: raw.material_id ?? null,
        created_at: raw.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Exam extraction carries the exact option text as answer_key —
      // preserve it so grading and the post-quiz answer key stay intact.
      const serverQuestions: Question[] = (body.questions || []).map(
        (q: any, idx: number) => ({
          id: q.id || `q-${Date.now()}-${idx}`,
          quiz_id: quiz.id,
          question_text: q.question_text || q.question,
          question_type: q.question_type || q.type,
          options: q.options || null,
          correct_answer: q.correct_answer ?? q.correctAnswer,
          answer_key: q.answer_key || null,
          explanation: q.explanation || null,
          topic: q.topic || null,
          difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
          marks: q.marks ?? 1,
          order_index: q.order_index ?? idx,
          created_at: q.created_at || new Date().toISOString(),
          figure: normalizeFigure(q.figure),
          preamble: normalizePreamble(q.preamble),
        })
      );

      // Only the existing host (or an admin) may overwrite an existing quiz
      // id via this upsert path.
      const quizzes = quizzesNow;
      const existingIdx = quizzes.findIndex((q) => q.id === quiz.id);
      if (existingIdx >= 0) {
        const existing = quizzes[existingIdx];
        const mayOverwrite =
          session.role === "admin" || existing.host_id === session.id || existing.host_id === "anonymous";
        if (!mayOverwrite) {
          return NextResponse.json(
            { error: "A quiz with this id already belongs to another creator" },
            { status: 409 }
          );
        }
        quizzes[existingIdx] = quiz;
      } else {
        quizzes.unshift(quiz);
      }
      writeServerQuizzes(quizzes);

      const allQuestions = readServerQuestions().filter((q) => q.quiz_id !== quiz.id);
      allQuestions.push(...serverQuestions);
      writeServerQuestions(allQuestions);

      await recordAdminAction(
        request,
        session,
        "quiz.create",
        "quiz",
        quiz.id,
        `Created quiz "${quiz.title}" with ${serverQuestions.length} questions`
      );

      return NextResponse.json({
        quiz,
        code: quiz.share_code,
      });
    }

    if (!local) {
      // A quiz needs an owner: host_id is a profiles(uuid) reference, so
      // creating one without a session used to fail the uuid cast and report a
      // confusing database error. Say what is actually missing.
      const creator = await getSessionUser(request).catch(() => null);
      if (!creator) {
        return NextResponse.json(
          { error: "Please log in to create a quiz." },
          { status: 401 }
        );
      }

      // Use admin client to create quiz in Supabase (bypasses RLS)
      let supabaseError: Error | null = null;
      let createdQuestionCount = 0;
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (!admin) throw new Error("Supabase admin client unavailable");

        const session = await getSessionUser(request).catch(() => null);
        const shareCode = "API-" + Math.random().toString(36).slice(2, 8).toUpperCase();

        // Important: published quizzes must be attributed to the actual creator.
        // Never silently assign the built-in admin id here; that makes the
        // quiz appear under the wrong account and breaks the admin-side list.
        // File/local accounts ("admin-001") are not uuids and fail the
        // host_id cast; map them to a real profile instead of losing the quiz.
        const hostId = await resolveQuizHostId(admin, session);
        if (!hostId) {
          throw new Error(
            "No database profile available to own this quiz. Sign in with a Supabase account, or create one first."
          );
        }

        const quizFields = {
          title: title.trim(),
          description: description || null,
          time_limit_minutes: time_limit_minutes || null,
          max_attempts: max_attempts ?? 1,
          show_answers_after: show_answers_after || "after_completion",
          shuffle_questions: shuffle_questions ?? true,
          shuffle_options: shuffle_options ?? true,
          passing_score: passing_score ?? 60,
          starts_at: starts_at ?? null,
          ends_at: ends_at ?? null,
          course_id: course_id ?? null,
          status: status || "published",
        };

        // A save that is retried must not become a second quiz. The client
        // sends one stable draft id for the whole form, so a repeated POST
        // (e.g. after a lost response) reuses the row the first attempt made
        // instead of inserting a duplicate under the same title.
        const draftId =
          typeof body.quiz?.id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.quiz.id)
            ? body.quiz.id
            : null;

        const storeQuestions = async (quizId: string): Promise<number> => {
          const questionInserts = questions.map((q: any, idx: number) => ({
            quiz_id: quizId,
            ...normalizeQuestionPayload(q, idx),
          }));
          let { error: qError } = await admin.from("questions").insert(questionInserts);
          // The `figure` column ships as a migration: retry without it rather
          // than lose the whole quiz because a deployment is one SQL file ahead.
          if (qError && isMissingOptionalColumn(qError)) {
            console.warn("[quizzes] questions.figure/preamble column missing — run the SQL in supabase/");
            ({ error: qError } = await admin
              .from("questions")
              .insert(questionInserts.map(({ figure: _figure, preamble: _preamble, ...rest }) => rest)));
          }
          if (qError) throw qError;
          return questionInserts.length;
        };

        if (draftId) {
          const { data: existing } = await admin
            .from("quizzes")
            .select("id,host_id,share_code")
            .eq("id", draftId)
            .maybeSingle();
          if (existing) {
            if (existing.host_id !== hostId && session?.role !== "admin") {
              return NextResponse.json(
                { error: "A quiz with this id already belongs to another creator" },
                { status: 409 }
              );
            }
            const { data: updated, error: updateError } = await admin
              .from("quizzes")
              .update({ ...quizFields, updated_at: new Date().toISOString() })
              .eq("id", draftId)
              .select()
              .single();
            if (updateError) throw updateError;
            const saved = updated as Quiz;
            // Only fill in questions when the earlier attempt stored none.
            // Replacing them on every retry would wipe a quiz that did save.
            const { count } = await admin
              .from("questions")
              .select("id", { count: "exact", head: true })
              .eq("quiz_id", draftId);
            if (!count) createdQuestionCount = await storeQuestions(draftId);

            if (session) {
              await recordAdminAction(
                request,
                session,
                "quiz.create",
                "quiz",
                saved.id,
                `Saved quiz "${saved.title}" with ${createdQuestionCount} questions`
              );
            }
            return NextResponse.json({ quiz: saved, code: existing.share_code, replayed: true });
          }
        }

        const { data: inserted, error: quizError } = await admin
          .from("quizzes")
          .insert({
            ...(draftId ? { id: draftId } : {}),
            host_id: hostId,
            share_code: shareCode,
            ...quizFields,
          })
          .select()
          .single();
        if (quizError) throw quizError;
        const created = inserted as Quiz;

        // Insert questions. A quiz whose questions could not be stored is
        // rolled back: leaving the row behind produced a published but empty
        // quiz that every list showed as a stray duplicate of the retry.
        if (questions && questions.length > 0) {
          try {
            createdQuestionCount = await storeQuestions(created.id);
          } catch (qErr) {
            const { error: rollbackError } = await admin
              .from("quizzes")
              .delete()
              .eq("id", created.id);
            if (rollbackError) {
              console.error(
                "[quizzes.create] could not roll back empty quiz",
                created.id,
                rollbackError.message
              );
            }
            throw qErr;
          }
        }

        if (session) {
          await recordAdminAction(
            request,
            session,
            "quiz.create",
            "quiz",
            created.id,
            `Created quiz "${created.title}" with ${createdQuestionCount} questions`
          );
        }

        return NextResponse.json({ quiz: created, code: shareCode });
      } catch (err) {
        if (err instanceof Error) supabaseError = err;
        else supabaseError = new Error(String(err));
      }

      // The database is the only durable store on a serverless host: a file
      // write there "succeeds" and is gone, so report the real failure.
      if (isEphemeralHost()) {
        console.error("[quizzes.create] database write failed:", supabaseError?.message);
        // A question type the table's check constraint rejects can never be
        // fixed by retrying — name it, otherwise the user just keeps clicking.
        const rejectedType = /question_type/i.test(supabaseError?.message || "");
        return userError("storage_unavailable", {
          message: rejectedType
            ? "This quiz has a question type the database doesn't accept yet. Nothing was created — run supabase/question-theory.sql in the Supabase SQL editor, then save again."
            : "Your quiz wasn't saved. Nothing was created — please try again in a moment.",
          extra: { not_persisted: true },
        });
      }

      // Supabase failed — fall back to local file
      const session = await getSessionUser(request).catch(() => null);
      const quizzes = readServerQuizzes();
      const quiz: Quiz = {
        id: `local-quiz-${Date.now()}`,
        host_id: session?.id || "anonymous",
        title: title.trim(),
        description: description || null,
        share_code:
          share_code || "FALLBACK-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        time_limit_minutes: time_limit_minutes || null,
        max_attempts: max_attempts ?? 1,
        show_answers_after: show_answers_after || "after_completion",
        shuffle_questions: shuffle_questions ?? true,
        shuffle_options: shuffle_options ?? true,
        passing_score: passing_score ?? 60,
        starts_at: starts_at ?? null,
        ends_at: ends_at ?? null,
        status: status || "published",
        course_id: course_id ?? null,
        material_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      quizzes.unshift(quiz);
      writeServerQuizzes(quizzes);

      if (questions && questions.length > 0) {
        // Exam extraction carries the exact option text as answer_key.
        const serverQuestions: Question[] = questions.map((q: any, idx: number) => ({
          id: q.id || `q-${Date.now()}-${idx}`,
          quiz_id: quiz.id,
          ...normalizeQuestionPayload(q, idx),
          answer_key: q.answer_key ?? null,
          created_at: q.created_at || new Date().toISOString(),
        }));
        const allQuestions = readServerQuestions();
        allQuestions.push(...serverQuestions);
        writeServerQuestions(allQuestions);
        const session = await getSessionUser(request).catch(() => null);
        if (session) {
          await recordAdminAction(
            request,
            session,
            "quiz.create",
            "quiz",
            quiz.id,
            `Created quiz "${quiz.title}" with ${serverQuestions.length} questions`
          );
        }
      } else {
        const session = await getSessionUser(request).catch(() => null);
        if (session) {
          await recordAdminAction(
            request,
            session,
            "quiz.create",
            "quiz",
            quiz.id,
            `Created quiz "${quiz.title}"`
          );
        }
      }

      return NextResponse.json({ quiz, code: quiz.share_code, fallback: true });
    }

    const result = await createQuiz(
      {
        title: title.trim(),
        description: description || undefined,
        time_limit_minutes: time_limit_minutes || undefined,
        questions,
      },
      local
    );

    return NextResponse.json({
      quiz: result.quiz,
      code: result.code,
    });
  } catch (error) {
    return serverError("quizzes.create", error, {
      message: "We couldn't create the quiz. Nothing was saved — please try again.",
    });
  }
}

