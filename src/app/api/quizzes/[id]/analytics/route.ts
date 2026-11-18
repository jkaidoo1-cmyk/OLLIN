import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { serverError } from "@/lib/api-errors";
import { analyseItems } from "@/lib/item-analytics";
import { normalizeFigure, normalizePreamble } from "@/lib/question-figure";

/**
 * GET /api/quizzes/[id]/analytics — per-item diagnosis for one quiz.
 *
 * Host or admin only. Selections live in attempt_answers (Supabase) or in the
 * file store's attempt records, and the attempts list endpoint deliberately does
 * not ship them to the browser, so the analysis is assembled here and only the
 * result leaves the server.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quizId } = await params;
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let hostId: string | null = null;
    let questions: any[] = [];
    const attempts: any[] = [];

    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const { data: quiz } = await admin
          .from("quizzes")
          .select("id, host_id")
          .eq("id", quizId)
          .maybeSingle();
        if (quiz) hostId = quiz.host_id;

        const { data: rows } = await admin
          .from("questions")
          .select("*")
          .eq("quiz_id", quizId)
          .order("order_index");
        questions = rows ?? [];

        const { data: attemptRows } = await admin
          .from("quiz_attempts")
          .select("id, score_percentage, status")
          .eq("quiz_id", quizId)
          .eq("status", "completed");
        const ids = (attemptRows ?? []).map((a: any) => a.id);
        const byAttempt = new Map<string, any[]>();
        if (ids.length) {
          const { data: answers } = await admin
            .from("attempt_answers")
            .select("attempt_id, question_id, selected_answer, is_correct")
            .in("attempt_id", ids);
          for (const row of answers ?? []) {
            const list = byAttempt.get((row as any).attempt_id) ?? [];
            list.push(row);
            byAttempt.set((row as any).attempt_id, list);
          }
        }
        for (const a of attemptRows ?? []) {
          attempts.push({ ...a, attempt_answers: byAttempt.get(a.id) ?? [] });
        }
      }
    } catch (error) {
      console.error("quiz analytics: Supabase read failed", error);
    }

    // File-store quizzes and their attempts carry the selections inline.
    if (!hostId || questions.length === 0) {
      const { readServerQuizzes, readServerAttempts } = await import("@/lib/data");
      const fileQuizzes = readServerQuizzes() as any[];
      const fileQuiz = fileQuizzes.find((q) => q.id === quizId);
      if (fileQuiz) hostId = hostId ?? fileQuiz.host_id;
      if (questions.length === 0) {
        const { getQuizQuestions } = await import("@/lib/data");
        questions = (await getQuizQuestions(quizId, true)) as any[];
      }
      const fileAttempts = (readServerAttempts() as any[]).filter(
        (a) => a.quiz_id === quizId && a.status === "completed"
      );
      const seen = new Set(attempts.map((a) => a.id));
      for (const a of fileAttempts) if (!seen.has(a.id)) attempts.push(a);
    }

    if (!hostId) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    if (session.role !== "admin" && session.id !== hostId) {
      return NextResponse.json({ error: "Not your quiz" }, { status: 403 });
    }

    const normalizedQuestions = questions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      correct_answer: q.correct_answer,
      options: q.options,
      question_type: q.question_type,
      preamble: normalizePreamble(q.preamble),
      figure: normalizeFigure(q.figure),
    }));

    return NextResponse.json(
      { analytics: analyseItems(normalizedQuestions, attempts) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return serverError("quiz analytics", error);
  }
}
