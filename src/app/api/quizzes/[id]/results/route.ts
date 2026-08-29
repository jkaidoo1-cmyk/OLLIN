import { NextRequest, NextResponse } from "next/server";
import { getQuizStats, getQuizAttempts } from "@/lib/data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { id } = await params;
    const stats = await getQuizStats(id, demo);

    if (!stats) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const attempts = await getQuizAttempts(id, demo);

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
