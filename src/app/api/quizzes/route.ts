import { NextRequest, NextResponse } from "next/server";
import { createQuiz, getUserQuizzes, readServerQuizzes, writeServerQuizzes, readServerQuestions, writeServerQuestions } from "@/lib/data";
import { Quiz, Question } from "@/lib/types";

// GET — list all quizzes
export async function GET(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    try {
      const quizzes = await getUserQuizzes(demo);
      return NextResponse.json({ quizzes });
    } catch (err) {
      // NO_BACKEND (Supabase unconfigured or unavailable) → file-backed storage
      if (err instanceof Error && err.message === "NO_BACKEND") {
        return NextResponse.json({ quizzes: readServerQuizzes() });
      }
      throw err;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch quizzes" },
      { status: 500 }
    );
  }
}

// POST — create a new quiz with questions.
// In demo mode, the client sends the fully-built quiz (`direct` mode) so it is
// persisted to the server file and is visible from every browser / the admin panel.
export async function POST(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const { title, description, time_limit_minutes, questions } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Quiz title is required" }, { status: 400 });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "At least one question is required" }, { status: 400 });
    }

    if (demo && body.quiz) {
      // Direct-save path: normalize the client-built quiz before persisting,
      // so a malformed payload can never poison the server file.
      const raw = body.quiz as Partial<Quiz>;
      const quizzesNow = readServerQuizzes();
      const quiz: Quiz = {
        id: raw.id || `demo-quiz-${Date.now()}`,
        host_id: raw.host_id || "demo-user-001",
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

      const quizzes = quizzesNow;
      const existingIdx = quizzes.findIndex((q) => q.id === quiz.id);
      if (existingIdx >= 0) quizzes[existingIdx] = quiz;
      else quizzes.unshift(quiz);
      writeServerQuizzes(quizzes);

      const allQuestions = readServerQuestions().filter((q) => q.quiz_id !== quiz.id);
      allQuestions.push(...serverQuestions);
      writeServerQuestions(allQuestions);

      return NextResponse.json({
        quiz,
        code: quiz.share_code,
      });
    }

    const result = await createQuiz(
      {
        title: title.trim(),
        description: description || undefined,
        time_limit_minutes: time_limit_minutes || undefined,
        questions,
      },
      demo
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
