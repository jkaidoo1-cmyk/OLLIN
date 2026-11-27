import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { isLocalRequest } from "@/lib/server-host";

/**
 * GET /api/quizzes/[id]/leaderboard?limit=10
 *
 * Top scores for a quiz. Ranks by score descending; ties broken by faster
 * completion time. If the requester is logged in, `your_rank` (1-based) is
 * their best attempt's position among all attempts.
 *
 * Attempts live in quiz_attempts on a deployed host and in the file store on a
 * local one. Reading only the file store made the leaderboard permanently
 * empty in production.
 */
interface LeaderRow {
  id: string;
  quiz_id: string;
  participant_id?: string | null;
  participant_name: string | null;
  participant_email?: string | null;
  score_percentage: number | null;
  correct_answers: number | null;
  total_questions: number | null;
  time_taken_seconds: number | null;
  completed_at: string | null;
  status: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "10", 10)));
    const local = isLocalRequest(request);

    const rows: LeaderRow[] = [];

    if (!local) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (admin) {
          const { data } = await admin
            .from("quiz_attempts")
            .select(
              "id,quiz_id,participant_id,participant_name,score_percentage,correct_answers,total_questions,time_taken_seconds,completed_at,status"
            )
            .eq("quiz_id", id)
            .eq("status", "completed")
            .limit(500);
          rows.push(...((data ?? []) as LeaderRow[]));
        }
      } catch {
        /* fall through to the file store */
      }
    }

    if (local || rows.length === 0) {
      const seen = new Set(rows.map((r) => r.id));
      for (const a of readServerAttempts() as unknown as LeaderRow[]) {
        if (a.quiz_id === id && a.status === "completed" && !seen.has(a.id)) rows.push(a);
      }
    }

    const ranked = rows.sort((a, b) => {
      const byScore = (b.score_percentage ?? 0) - (a.score_percentage ?? 0);
      if (byScore !== 0) return byScore;
      const ta = a.time_taken_seconds ?? Number.MAX_SAFE_INTEGER;
      const tb = b.time_taken_seconds ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

    const session = await getSessionUser(request).catch(() => null);
    // Database rows are owned by participant_id; file rows by email.
    const isMine = (a: LeaderRow) =>
      !!session &&
      (a.participant_id === session.id ||
        (!!a.participant_email && a.participant_email === session.email));

    let yourRank: number | null = null;
    let yourBest: { score: number; correct: number; total: number } | null = null;

    if (session) {
      const mine = ranked.filter(isMine);
      if (mine.length > 0) {
        const best = mine[0]; // ranked list → first is best
        yourRank = ranked.indexOf(best) + 1;
        yourBest = {
          score: best.score_percentage ?? 0,
          correct: best.correct_answers ?? 0,
          total: best.total_questions ?? 0,
        };
      }
    }

    return NextResponse.json({
      total_attempts: ranked.length,
      leaders: ranked.slice(0, limit).map((a, i) => ({
        rank: i + 1,
        name: a.participant_name || "Anonymous",
        score: a.score_percentage ?? 0,
        correct: a.correct_answers ?? 0,
        total: a.total_questions ?? 0,
        time_seconds: a.time_taken_seconds,
        completed_at: a.completed_at,
        is_you: isMine(a),
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
