import { NextRequest, NextResponse } from "next/server";
import { createQuiz, getUserQuizzes, readServerQuizzes, writeServerQuizzes, readServerQuestions, writeServerQuestions } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
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
    const local = request.headers.get("x-local-mode") === "true";
    let quizzes: Quiz[] = [];

    // Always try file store first (local data + fallback)
    try {
      quizzes = readServerQuizzes();
    } catch { quizzes = []; }

    // Merge in Supabase quizzes (admin client — reads all published quizzes)
    if (!local) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (admin) {
          const { data, error } = await admin
            .from("quizzes")
            .select("*")
            .eq("status", "published")
            .order("created_at", { ascending: false });
          if (!error && data) {
            const sbIds = new Set((data || []).map((q: any) => q.id));
            // Replace file quizzes with Supabase versions when they match
            const merged = (data || []).map((q: any) => ({
              ...q,
              share_code: q.share_code,
            }));
            // Add file-only quizzes that aren't in Supabase
            for (const fq of quizzes) {
              if (!sbIds.has(fq.id)) merged.push(fq);
            }
            quizzes = merged;
          }
        }
      } catch { /* Supabase optional */ }
    }

    return NextResponse.json({ quizzes: quizzes.map(stripQuestionData) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch quizzes" },
      { status: 500 }
    );
  }
}

// POST — create a new quiz with questions.
// In local mode, the client sends the fully-built quiz (`direct` mode) so it is
// persisted to the server file and is visible from every browser / the admin panel.
// host_id is always derived from the server-side session — a client-supplied
// host_id is ignored, so one student can't claim another teacher's quizzes.
export async function POST(request: NextRequest) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { title, description, time_limit_minutes, questions } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Quiz title is required" }, { status: 400 });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "At least one question is required" }, { status: 400 });
    }
    if (questions.length > 500) {
      return NextResponse.json({ error: "A quiz can have at most 500 questions" }, { status: 422 });
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
      const serverQuestions: Question[] = (body.questions || []).map(
        (q: any, idx: number) => ({
          id: q.id || `q-${Date.now()}-${idx}`,
          quiz_id: quiz.id,
          question_text: q.question_text || q.question,
          question_type: q.question_type || q.type,
          options: q.options || null,
          correct_answer: q.correct_answer ?? q.correctAnswer,
          explanation: q.explanation || null,
          topic: q.topic || null,
          difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
          marks: q.marks ?? 1,
          order_index: q.order_index ?? idx,
          created_at: q.created_at || new Date().toISOString(),
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

      return NextResponse.json({
        quiz,
        code: quiz.share_code,
      });
    }

    if (!local) {
      // Use admin client to create quiz in Supabase (bypasses RLS)
      let supabaseError: Error | null = null;
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (!admin) throw new Error("Supabase admin client unavailable");

        const shareCode = "API-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        // Resolve admin UUID from Supabase profiles (admin-001 is a string ID, not a UUID)
        const { data: adminProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", "jkaidoo1@mail.com")
          .maybeSingle();
        const hostId = (adminProfile && adminProfile.id) ? adminProfile.id : undefined;

        const { data: quiz, error: quizError } = await admin
          .from("quizzes")
          .insert({
            host_id: hostId || "bd4d7d39-3631-4b45-b86a-f18e2ff150f9",
            title: title.trim(),
            description: description || null,
            share_code: shareCode,
            time_limit_minutes: time_limit_minutes || null,
            max_attempts: 1,
            show_answers_after: "after_completion",
            shuffle_questions: true,
            shuffle_options: true,
            passing_score: 60,
            course_id: null,
            status: "published",
          })
          .select()
          .single();
        if (quizError) throw quizError;

        // Insert questions
        if (questions && questions.length > 0) {
          const questionInserts = questions.map((q: any, idx: number) => ({
            quiz_id: quiz.id,
            question_text: q.question,
            question_type: q.type,
            options: q.options || null,
            correct_answer: q.correctAnswer,
            explanation: q.explanation || null,
            topic: q.topic || null,
            difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
            marks: 1,
            order_index: idx,
          }));
          const { error: qError } = await admin.from("questions").insert(questionInserts);
          if (qError) throw qError;
        }

        return NextResponse.json({ quiz, code: shareCode });
      } catch (err) {
        if (err instanceof Error) supabaseError = err;
        else supabaseError = new Error(String(err));
      }

      // Supabase failed — fall back to local file
      const quizzes = readServerQuizzes();
      const quiz: Quiz = {
        id: `local-quiz-${Date.now()}`,
        host_id: "bd4d7d39-3631-4b45-b86a-f18e2ff150f9",
        title: title.trim(),
        description: description || null,
        share_code: "FALLBACK-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        time_limit_minutes: time_limit_minutes || null,
        max_attempts: 1,
        show_answers_after: "after_completion",
        shuffle_questions: true,
        shuffle_options: true,
        passing_score: 60,
        starts_at: null,
        ends_at: null,
        status: "published",
        course_id: null,
        material_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      quizzes.unshift(quiz);
      writeServerQuizzes(quizzes);

      if (questions && questions.length > 0) {
        const serverQuestions: Question[] = questions.map((q: any, idx: number) => ({
          id: `q-${Date.now()}-${idx}`,
          quiz_id: quiz.id,
          question_text: q.question,
          question_type: q.type as Question["question_type"],
          options: q.options || null,
          correct_answer: q.correctAnswer,
          explanation: q.explanation || null,
          topic: q.topic || null,
          difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
          marks: 1,
          order_index: idx,
          created_at: new Date().toISOString(),
        }));
        const allQuestions = readServerQuestions();
        allQuestions.push(...serverQuestions);
        writeServerQuestions(allQuestions);
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
    console.error("Quiz creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quiz" },
      { status: 500 }
    );
  }
}

/** Participant-safe shape: no correct answers or explanations. */
export function stripQuestionData(q: Partial<Quiz>) {
  return {
    id: q.id,
    host_id: q.host_id,
    title: q.title,
    description: q.description,
    share_code: q.share_code,
    time_limit_minutes: q.time_limit_minutes,
    max_attempts: q.max_attempts,
    show_answers_after: q.show_answers_after,
    shuffle_questions: q.shuffle_questions,
    shuffle_options: q.shuffle_options,
    passing_score: q.passing_score,
    starts_at: q.starts_at,
    ends_at: q.ends_at,
    status: q.status,
    course_id: q.course_id,
    created_at: q.created_at,
    updated_at: q.updated_at,
  };
}
