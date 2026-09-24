import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts, writeServerAttempts } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

/**
 * GET /api/attempts?quiz_id=xxx&mine=true — Fetch server-side attempts.
 *   - mine=true: attempts recorded for the logged-in user's email (any mode)
 *   - quiz_id=X: attempts for one quiz
 */
export async function GET(request: NextRequest) {
  try {
    const quizId = request.nextUrl.searchParams.get("quiz_id");
    const mine = request.nextUrl.searchParams.get("mine") === "true";
    const allAttempts = readServerAttempts();

    if (mine) {
      const session = await getSessionUser(request);
      if (!session) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const myAttempts = allAttempts.filter(
        (a: any) => a.participant_email === session.email
      );
      return NextResponse.json({ attempts: myAttempts });
    }

    if (quizId) {
      // Single quiz — only its creator or an admin may read the roster
      // (names + scores); anyone can hit this URL by guessing quiz ids.
      const { readServerQuizzes } = await import("@/lib/data");
      const quiz = readServerQuizzes().find((q) => q.id === quizId);
      const session2 = await getSessionUser(request);
      const isCreator = !!session2 && ((quiz && session2.id === quiz.host_id) || session2.role === "admin");
      if (!isCreator) {
        return NextResponse.json(
          { error: "Only the quiz creator or an admin can view attempts" },
          { status: 403 }
        );
      }
      const quizAttempts = allAttempts.filter((a) => a.quiz_id === quizId);
      return NextResponse.json({ attempts: quizAttempts });
    }

    // All attempts — admin/creator overview (dashboard). Same rule as above:
    // participants only get their own via ?mine=true.
    const sessionAll = await getSessionUser(request);
    if (!sessionAll || sessionAll.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }
    return NextResponse.json({ attempts: allAttempts });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch attempts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/attempts — Save a guest attempt server-side
 * Guests can't write to localStorage on the creator's machine, so we save
 * attempts to a server file so the quiz creator can see them.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      quiz_id,
      participant_name,
      score_percentage,
      correct_answers,
      total_questions,
      time_taken_seconds,
      status,
      completed_at,
      answers,
    } = body;

    if (!quiz_id) {
      return NextResponse.json({ error: "quiz_id is required" }, { status: 400 });
    }

    // Record who took the quiz when logged in (session cookie may be present)
    let participantEmail: string | null = null;
    try {
      const session = await getSessionUser(request);
      if (session) participantEmail = session.email;
    } catch { /* guests stay anonymous */ }

    // ── Duplicate-submission guard ──────────────────────────
    // A logged-in student gets ONE completed attempt per quiz. Retakes would
    // let them keep their best score (and spam the leaderboard).
    if (participantEmail && status !== "in_progress") {
      const already = readServerAttempts().find(
        (a: any) =>
          a.quiz_id === quiz_id &&
          a.participant_email === participantEmail &&
          a.status === "completed"
      );
      if (already) {
        return NextResponse.json(
          { error: "You have already taken this quiz.", attempt_id: already.id, duplicate: true },
          { status: 409 }
        );
      }
    }

    const attempt = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quiz_id,
      participant_id: null,
      participant_email: participantEmail,
      participant_name: participant_name || "Anonymous",
      started_at: completed_at || new Date().toISOString(),
      completed_at: completed_at || new Date().toISOString(),
      time_taken_seconds: time_taken_seconds || null,
      total_questions: total_questions || 0,
      correct_answers: correct_answers || 0,
      score_percentage: score_percentage || 0,
      marks_earned: correct_answers || 0,
      marks_total: total_questions || 0,
      status: status || "completed",
      answers: answers || null, // question_id → selected answer, for review
      created_at: new Date().toISOString(),
    };

    const attempts = readServerAttempts();
    // Replace an existing row with the same id (in_progress → completed on
    // resubmit) so My attempts doesn't show a 0% twin next to the real one.
    // For timed-out markers (which mint a fresh client id) also retire any
    // leftover in_progress row for the same participant + quiz.
    let idx = attempts.findIndex((a) => a.id === attempt.id);
    if (idx < 0 && attempt.status === "timed_out" && attempt.participant_email) {
      idx = attempts.findIndex(
        (a) => a.quiz_id === attempt.quiz_id && a.participant_email === attempt.participant_email && a.status === "in_progress"
      );
    }
    if (idx >= 0) attempts[idx] = attempt;
    else attempts.push(attempt);
    writeServerAttempts(attempts);

    return NextResponse.json({ attempt });
  } catch (error) {
    console.error("Attempt save error:", error);
    return NextResponse.json(
      { error: "Failed to save attempt" },
      { status: 500 }
    );
  }
}
