import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts, writeServerAttempts, saveAnswer, getQuizQuestions } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { checkThrottle } from "@/lib/rate-limit";
import type { QuizAttempt } from "@/lib/types";

/** File-mode attempt rows carry an answers map (question_id → selection). */
type AttemptRow = QuizAttempt & { answers?: Record<string, string> | null };

/**
 * POST /api/attempts/[id]/answer — autosave one answer during a quiz.
 *
 * Hardened (guide: never trust client input for state/grades):
 *  - The client's is_correct/marks_awarded are IGNORED. Correctness is derived
 *    server-side from the stored questions, mirroring the submit route's
 *    grading — otherwise any participant could autosave a perfect score.
 *  - The attempt must exist and still be in_progress.
 *  - An attempt tied to a logged-in participant can only be written by that
 *    participant (or an admin). Anonymous attempts have no credential to check.
 *  - Inputs are clamped; request rates are throttled.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const throttle = checkThrottle(request, "answer-write", 120, 60_000);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: throttle.message },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const questionId = String(body.question_id ?? "").slice(0, 120);
    const selected = String(body.selected_answer ?? "").slice(0, 500);
    if (!questionId || body.selected_answer === undefined) {
      return NextResponse.json(
        { error: "question_id and selected_answer are required" },
        { status: 400 }
      );
    }

    const attempt = readServerAttempts().find((a) => a.id === id) as AttemptRow | undefined;
    if (!attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }
    if (attempt.status !== "in_progress") {
      return NextResponse.json({ error: "This attempt is already finished" }, { status: 409 });
    }

    if (attempt.participant_email) {
      const session = await getSessionUser(request).catch(() => null);
      const allowed =
        !!session && (session.email === attempt.participant_email || session.role === "admin");
      if (!allowed) {
        return NextResponse.json({ error: "Not your attempt" }, { status: 403 });
      }
    }

    // Server-derived correctness — mirrors the submit route's normalization.
    const questions = (await getQuizQuestions(attempt.quiz_id, true)) as any[];
    const q = questions.find((qq) => qq.id === questionId);
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const isCorrect = !!q && norm(selected) === norm(q.correct_answer);
    const marks = isCorrect ? (q?.marks ?? 1) : 0;

    // File mode keeps the autosave on the attempt row itself; the row-level
    // answer store below is the Supabase-backed path.
    if (attempt.answers && typeof attempt.answers === "object" && !Array.isArray(attempt.answers)) {
      attempt.answers[questionId] = selected;
      writeServerAttempts(readServerAttempts().map((a) => (a.id === id ? attempt : a)));
    }

    try {
      await saveAnswer(id, questionId, selected, isCorrect, marks, local);
    } catch { /* Supabase unconfigured — the attempt row carries the answer */ }

    return NextResponse.json({ success: true, is_correct: isCorrect });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save answer" },
      { status: 500 }
    );
  }
}
