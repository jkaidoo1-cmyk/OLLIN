import { NextRequest, NextResponse } from "next/server";
import { getQuizById, getQuizByCode, deleteQuiz, getQuizQuestions } from "@/lib/data";

// GET — get quiz by ID or share code, with questions (public, no auth required)
// Resolve the requester's session (null for guests)
async function getSession(request: NextRequest) {
  const { getSessionUser } = await import("@/lib/session");
  return getSessionUser(request);
}

// Host-or-admin gate shared by edit (PUT) and delete (DELETE)
async function canManage(quiz: any, request: NextRequest): Promise<boolean> {
  const session = await getSession(request);
  if (!session) return false;
  return session.role === "admin" || session.id === quiz.host_id;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    // Users type codes on their phone in any form: "cez772", "cez-772",
    // " CEZ-772 ". Normalize (strip non-alphanumerics, uppercase) before
    // matching — stored codes compare in the same normalized form.
    const norm = rawId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const id = norm || rawId;

    const local = request.headers.get("x-local-mode") === "true" || !request.headers.get("authorization");

    // Try by ID first (deep links), then by normalized share code
    let quiz = await getQuizById(rawId, local);
    if (!quiz) {
      quiz = await getQuizByCode(norm, local);
    }

    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const questions = await getQuizQuestions(quiz.id, local);

    // Editor mode: the quiz's host (or an admin) may fetch the full question
    // bank including answers, to edit the quiz. Everyone else gets the
    // stripped public view.
    const includeAnswers = new URL(request.url).searchParams.get("include") === "answers";
    if (includeAnswers) {
      if (!(await canManage(quiz, request))) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
      return NextResponse.json({ quiz, questions });
    }

    // SECURITY: this endpoint is public (guests join by code). Correct
    // answers and explanations must never reach the browser before the
    // attempt is graded — they're the quiz's answer key.
    const publicQuestions = questions.map((q: any) => {
      const { correct_answer, explanation, ...safe } = q;
      return safe;
    });

    return NextResponse.json({ quiz, questions: publicQuestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch quiz" },
      { status: 500 }
    );
  }
}

// DELETE — delete a quiz
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    const quiz = await getQuizById(id, local);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    if (!(await canManage(quiz, request))) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    await deleteQuiz(id, local);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete quiz" },
      { status: 500 }
    );
  }
}

// PUT — edit a quiz (host or admin only). Accepts the same quiz+questions
// shape the create flow posts; replaces the quiz fields and its questions.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    const body = await request.json();

    const existing = await getQuizById(id, local);
    if (!existing) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    if (!(await canManage(existing, request))) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const questions = body.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "At least one question is required" }, { status: 400 });
    }

    // Server file mode: upsert the quiz row, replace its questions.
    const { readServerQuizzes, writeServerQuizzes, readServerQuestions, writeServerQuestions } =
      await import("@/lib/data");

    const raw = body.quiz || {};
    const quiz = {
      ...existing,
      title: String(raw.title ?? existing.title).trim() || existing.title,
      description: raw.description ?? existing.description,
      time_limit_minutes: raw.time_limit_minutes ?? existing.time_limit_minutes,
      shuffle_questions: raw.shuffle_questions ?? existing.shuffle_questions,
      passing_score: raw.passing_score ?? existing.passing_score,
      starts_at: raw.starts_at ?? existing.starts_at,
      ends_at: raw.ends_at ?? existing.ends_at,
      course_id: raw.course_id ?? existing.course_id,
      status: raw.status ?? existing.status,
      updated_at: new Date().toISOString(),
    };

    const quizzes = readServerQuizzes();
    const idx = quizzes.findIndex((q) => q.id === quiz.id);
    if (idx >= 0) quizzes[idx] = quiz as any;
    else quizzes.unshift(quiz as any);
    writeServerQuizzes(quizzes);

    const kept = readServerQuestions().filter((q) => q.quiz_id !== quiz.id);
    kept.push(
      ...questions.map((q: any, i: number) => ({
        id: q.id || `q-${Date.now()}-${i}`,
        quiz_id: quiz.id,
        question_text: q.question_text || q.question,
        question_type: q.question_type || q.type,
        options: q.options || null,
        correct_answer: q.correct_answer ?? q.correctAnswer,
        explanation: q.explanation || null,
        topic: q.topic || null,
        difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
        marks: q.marks ?? 1,
        order_index: q.order_index ?? i,
        created_at: q.created_at || new Date().toISOString(),
      }))
    );
    writeServerQuestions(kept);

    return NextResponse.json({ quiz, success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update quiz" },
      { status: 500 }
    );
  }
}
