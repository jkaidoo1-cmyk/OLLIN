import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts, writeServerAttempts } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { getClientIp, checkThrottle } from "@/lib/rate-limit";

// ── Input clamping helpers ─────────────────────────────
// Every client-supplied field is length/range-capped before it reaches the
// store, so an abusive payload can't bloat the data file or poison stats.
const clampStr = (v: unknown, max: number): string =>
  String(v ?? "").trim().slice(0, max);

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Persist attempts and VERIFY the write landed. On a read-only filesystem
 * (Vercel without Supabase) writeFileSync fails silently — reporting success
 * would lose the student's score while telling them it was saved.
 * Returns false when the record did not stick.
 */
function persistAttempts(list: ReturnType<typeof readServerAttempts>, id: string): boolean {
  writeServerAttempts(list);
  try {
    return readServerAttempts().some((a) => a.id === id);
  } catch {
    return false;
  }
}

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
    // Response-size cap: a quiz id with thousands of rows must not be able to
    // stall the browser or the JSON serializer.
    const limitRaw = parseInt(request.nextUrl.searchParams.get("limit") || "200", 10);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200));

    if (mine) {
      const session = await getSessionUser(request);
      if (!session) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const myAttempts = allAttempts
        .filter((a: any) => a.participant_email === session.email)
        .sort((a: any, b: any) =>
          String(b.completed_at || b.started_at || "").localeCompare(String(a.completed_at || a.started_at || ""))
        )
        .slice(0, limit);
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
      const quizAttempts = allAttempts
        .filter((a) => a.quiz_id === quizId)
        .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")))
        .slice(0, limit);
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
    return NextResponse.json({ attempts: allAttempts.slice(0, limit) });
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
    // Abuse cap: attempt writes hit the filesystem on every join/submit.
    const throttle = checkThrottle(request, "attempt-write", 60, 60_000);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: throttle.message },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
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

    if (!quiz_id || typeof quiz_id !== "string") {
      return NextResponse.json({ error: "quiz_id is required" }, { status: 400 });
    }
    const safeQuizId = quiz_id.trim().slice(0, 120);
    if (!safeQuizId) {
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
          a.quiz_id === safeQuizId &&
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

    // ── Resume an unfinished attempt instead of minting a new one ──
    // A student who joined, refreshed (or lost connection) and comes back
    // must resume the SAME attempt with its ORIGINAL start time. Otherwise:
    //   (a) the page starts a fresh timer for time already spent, and
    //   (b) the abandoned in_progress row lingers as a 0% phantom in
    //       My attempts and the creator's roster.
    if (status === "in_progress") {
      const attemptsNow = readServerAttempts();
      const resumable = attemptsNow.find(
        (a: any) =>
          a.quiz_id === safeQuizId &&
          a.status === "in_progress" &&
          (participantEmail
            ? a.participant_email === participantEmail
            : a.participant_name === (participant_name || "Anonymous") && !a.participant_email)
      );
      if (resumable) {
        // Refresh the display name (they may have typed a different one)
        resumable.participant_name = clampStr(participant_name, 80) || resumable.participant_name;
        if (participantEmail && !resumable.participant_email) {
          resumable.participant_email = participantEmail;
        }
        if (!persistAttempts(attemptsNow, resumable.id)) {
          return NextResponse.json(
            { error: "Could not save your attempt — this deployment has no writable storage (and Supabase is not connected).", not_persisted: true },
            { status: 507 }
          );
        }
        return NextResponse.json({ attempt: resumable, resumed: true });
      }
    }

    // A caller that omits `status` is either an older client posting a finished
    // attempt (it carries the score it computed) or a joiner that only knows
    // the quiz. Defaulting every bare post to "completed" minted a 0% phantom
    // row at join time, which then matched the duplicate guard and locked the
    // student out of their own submission (409 "already taken this quiz").
    const hasCompletionEvidence =
      completed_at != null ||
      score_percentage !== undefined ||
      correct_answers !== undefined ||
      total_questions !== undefined;
    const attemptStatus = ["completed", "in_progress", "timed_out", "abandoned"].includes(status)
      ? status
      : hasCompletionEvidence
        ? "completed"
        : "in_progress";

    const attempt = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quiz_id: safeQuizId,
      participant_id: null,
      participant_email: participantEmail,
      participant_name: clampStr(participant_name, 80) || "Anonymous",
      started_at: clampDate(completed_at) || new Date().toISOString(),
      completed_at: clampDate(completed_at) || new Date().toISOString(),
      time_taken_seconds: clampInt(time_taken_seconds, 0, 24 * 60 * 60, 0) || null,
      total_questions: clampInt(total_questions, 0, 1000, 0),
      correct_answers: clampInt(correct_answers, 0, 1000, 0),
      score_percentage: clampInt(score_percentage, 0, 100, 0),
      marks_earned: clampInt(correct_answers, 0, 1000, 0),
      marks_total: clampInt(total_questions, 0, 1000, 0),
      status: attemptStatus,
      answers: answers || null, // question_id → selected answer, for review
      created_at: new Date().toISOString(),
    };

    const attemptsList = readServerAttempts();
    // Replace an existing row with the same id (in_progress → completed on
    // resubmit) so My attempts doesn't show a 0% twin next to the real one.
    // For timed-out markers (which mint a fresh client id) also retire any
    // leftover in_progress row for the same participant + quiz.
    let idx = attemptsList.findIndex((a) => a.id === attempt.id);
    if (idx < 0 && attemptStatus === "timed_out" && attempt.participant_email) {
      idx = attemptsList.findIndex(
        (a) => a.quiz_id === attempt.quiz_id && a.participant_email === attempt.participant_email && a.status === "in_progress"
      );
    }
    if (idx >= 0) attemptsList[idx] = attempt;
    else attemptsList.push(attempt);
    if (!persistAttempts(attemptsList, attempt.id)) {
      return NextResponse.json(
        { error: "Could not save your attempt — this deployment has no writable storage (and Supabase is not connected).", not_persisted: true },
        { status: 507 }
      );
    }

    return NextResponse.json({ attempt });
  } catch (error) {
    console.error("Attempt save error:", error);
    return NextResponse.json(
      { error: "Failed to save attempt" },
      { status: 500 }
    );
  }
}
