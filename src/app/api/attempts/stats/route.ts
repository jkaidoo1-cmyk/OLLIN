import { NextRequest, NextResponse } from "next/server";
import {
  readServerAttempts,
  readServerQuestions,
  readServerQuizzes,
} from "@/lib/data";
import { serverGetLocalQuizById, serverGetLocalQuestions } from "@/lib/server-local";
import { getSessionUser } from "@/lib/session";

/**
 * GET /api/attempts/stats?quiz_id=xxx — aggregate results for one quiz.
 * Auth: only the quiz creator (host) or an admin may read the stats, so
 * participants of a live quiz can't see the class distribution while it runs.
 */
export async function GET(request: NextRequest) {
  try {
    const quizId = request.nextUrl.searchParams.get("quiz_id");
    if (!quizId) {
      return NextResponse.json({ error: "quiz_id is required" }, { status: 400 });
    }

    const quiz =
      readServerQuizzes().find((q) => q.id === quizId) ||
      serverGetLocalQuizById(quizId) ||
      null;
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const requester = await getSessionUser(request);
    const isCreator = !!requester && (requester.id === quiz.host_id || requester.role === "admin");
    if (!isCreator) {
      return NextResponse.json(
        { error: "Only the quiz creator or an admin can view results" },
        { status: 403 }
      );
    }

    const allAttempts = readServerAttempts() as any[];
    const quizAttempts = allAttempts.filter(
      (a) => a.quiz_id === quizId && a.status !== "in_progress"
    );
    const completed = quizAttempts.filter((a) => a.status !== "abandoned");

    const scores = completed
      .map((a) => Number(a.score_percentage) || 0)
      .sort((a, b) => a - b);
    const avg = scores.length
      ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
      : 0;
    const median = scores.length
      ? scores.length % 2 === 1
        ? scores[(scores.length - 1) / 2]
        : Math.round((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
      : 0;
    const best = scores.length ? scores[scores.length - 1] : 0;
    const worst = scores.length ? scores[0] : 0;

    // Score distribution in 10-point buckets: 0-9, 10-19, ... 90-100
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      bucket: i === 9 ? "90-100" : `${i * 10}-${i * 10 + 9}`,
      count: 0,
    }));
    for (const s of scores) {
      const idx = Math.min(9, Math.floor(s / 10));
      distribution[idx].count += 1;
    }

    // Per-question list. Attempts currently store only totals, not per-question
    // answers, so correct_rate is null until that data exists — the UI hides
    // the bar rather than showing a fake 0%.
    const questions =
      readServerQuestions().filter((q) => q.quiz_id === quizId) ||
      serverGetLocalQuestions(quizId);
    const per_question = questions.map((q, i) => ({
      index: i + 1,
      question: q.question_text,
      type: q.question_type,
      correct_rate: null as number | null,
    }));

    // Recent attempts (latest 20)
    const recent = [...completed]
      .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")))
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        participant: a.participant_name || "Anonymous",
        score: Number(a.score_percentage) || 0,
        correct: a.correct_answers ?? null,
        total: a.total_questions ?? null,
        time_taken_seconds: a.time_taken_seconds ?? null,
        completed_at: a.completed_at ?? null,
      }));

    return NextResponse.json({
      quiz_id: quizId,
      title: quiz.title,
      total_attempts: quizAttempts.length,
      completed: completed.length,
      abandoned: quizAttempts.length - completed.length,
      average_score: avg,
      median_score: median,
      highest_score: best,
      lowest_score: worst,
      distribution,
      per_question,
      recent,
    });
  } catch (error) {
    console.error("Attempt stats error:", error);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
