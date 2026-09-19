import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

/**
 * GET /api/quizzes/[id]/leaderboard?limit=10
 *
 * Top scores for a quiz. Ranks by score descending; ties broken by faster
 * completion time. If the requester is logged in, `your_rank` (1-based) is
 * their best attempt's position among all attempts.
 *
 * Reads from the server attempts store (the quiz page records every
 * completed attempt there, in both storage modes).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "10", 10)));

    const attempts = readServerAttempts() as unknown as Array<{
      quiz_id: string;
      participant_name: string;
      participant_email?: string | null;
      score_percentage: number;
      correct_answers: number;
      total_questions: number;
      time_taken_seconds: number | null;
      completed_at: string;
      status: string;
    }>;

    const ranked = attempts
      .filter((a) => a.quiz_id === id && a.status === "completed")
      .sort((a, b) => {
        if (b.score_percentage !== a.score_percentage) {
          return b.score_percentage - a.score_percentage;
        }
        const ta = a.time_taken_seconds ?? Number.MAX_SAFE_INTEGER;
        const tb = b.time_taken_seconds ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });

    const session = await getSessionUser(request).catch(() => null);
    let yourRank: number | null = null;
    let yourBest: { score: number; correct: number; total: number } | null = null;

    if (session) {
      const mine = ranked.filter((a) => a.participant_email === session.email);
      if (mine.length > 0) {
        const best = mine[0]; // ranked list → first is best
        yourRank = ranked.indexOf(best) + 1;
        yourBest = {
          score: best.score_percentage,
          correct: best.correct_answers,
          total: best.total_questions,
        };
      }
    }

    return NextResponse.json({
      total_attempts: ranked.length,
      leaders: ranked.slice(0, limit).map((a, i) => ({
        rank: i + 1,
        name: a.participant_name || "Anonymous",
        score: a.score_percentage,
        correct: a.correct_answers,
        total: a.total_questions,
        time_seconds: a.time_taken_seconds,
        completed_at: a.completed_at,
        is_you: !!session && a.participant_email === session.email,
      })),
      your_rank: yourRank,
      your_best: yourBest,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
