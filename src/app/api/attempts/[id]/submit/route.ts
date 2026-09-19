import { NextRequest, NextResponse } from "next/server";
import { submitAttempt, getAttemptAnswers, getQuizById, getAttemptQuizId } from "@/lib/data";

// POST — submit an attempt with all answers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    const body = await request.json();
    const { answers } = body;

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "answers array is required" },
        { status: 400 }
      );
    }

    // ── Server-side time-window enforcement ──────────────────
    // The UI hides the quiz outside its window; the server must also refuse
    // submissions outside it (clients can be manipulated).
    const quizId = body.quiz_id || (await getAttemptQuizId(id, local));
    if (quizId) {
      const quiz = await getQuizById(quizId, local);
      if (quiz) {
        const now = Date.now();
        if (quiz.starts_at && now < new Date(quiz.starts_at).getTime()) {
          return NextResponse.json(
            { error: "This quiz is not open yet." },
            { status: 403 }
          );
        }
        if (quiz.ends_at && now > new Date(quiz.ends_at).getTime()) {
          return NextResponse.json(
            { error: "This quiz has closed." },
            { status: 403 }
          );
        }
      }
    }

    // Pass the quiz id so grading can find the questions even when the
    // attempt record doesn't exist yet (e.g. client-only attempt IDs).
    const attempt = await submitAttempt(id, answers, local, quizId || body.quiz_id);
    const savedAnswers = await getAttemptAnswers(id, local);

    return NextResponse.json({ attempt, answers: savedAnswers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit attempt" },
      { status: 500 }
    );
  }
}
