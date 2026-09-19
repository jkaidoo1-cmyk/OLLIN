import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { getQuizQuestions } from "@/lib/data";

/**
 * GET /api/attempts/[id]/review — question-by-question review for ONE attempt.
 *
 * Only the participant who made the attempt (matched by session email) or an
 * admin may read it. Returns the full questions including correct answers and
 * explanations — safe because access is scoped to the attempt owner, unlike
 * the general questions endpoint which strips answers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const attempts = readServerAttempts() as unknown as Array<{
      id: string;
      quiz_id: string;
      participant_email: string | null;
      answers: Record<string, string> | null;
    }>;
    const attempt = attempts.find((a) => a.id === id);

    if (!attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const isOwner = attempt.participant_email && attempt.participant_email === session.email;
    const isAdmin = session.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Not your attempt" }, { status: 403 });
    }

    const questions = await getQuizQuestions(attempt.quiz_id, true);

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        quiz_id: attempt.quiz_id,
        answers: attempt.answers || {},
      },
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        type: q.question_type,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load review" },
      { status: 500 }
    );
  }
}
