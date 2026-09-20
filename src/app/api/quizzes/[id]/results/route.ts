import { NextRequest, NextResponse } from "next/server";
import { getQuizStats, getQuizAttempts, getQuizById } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    const stats = await getQuizStats(id, local);

    if (!stats) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    // Participant roster (names + scores) is creator/admin-only.
    const quiz = await getQuizById(id, local) || await getQuizByCodeSafe(id, local);
    const session = await getSessionUser(request);
    const isCreator = !!session && ((quiz && session.id === quiz.host_id) || session.role === "admin");
    if (!isCreator) {
      return NextResponse.json(
        { error: "Only the quiz creator or an admin can view results" },
        { status: 403 }
      );
    }

    const attempts = await getQuizAttempts(id, local);

    return NextResponse.json({
      stats,
      attempts: attempts.map((a) => ({
        id: a.id,
        participant_name: a.participant_name || "Anonymous",
        score_percentage: a.score_percentage,
        correct_answers: a.correct_answers,
        total_questions: a.total_questions,
        time_taken_seconds: a.time_taken_seconds,
        status: a.status,
        started_at: a.started_at,
        completed_at: a.completed_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch results" },
      { status: 500 }
    );
  }
}

/** Resolve id-or-code to a quiz without failing when not found. */
async function getQuizByCodeSafe(idOrCode: string, local: boolean) {
  try {
    const { getQuizByCode } = await import("@/lib/data");
    return await getQuizByCode(idOrCode, local);
  } catch {
    return null;
  }
}
