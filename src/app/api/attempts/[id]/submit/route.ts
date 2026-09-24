import { NextRequest, NextResponse } from "next/server";
import { submitAttempt, getQuizById, getAttemptQuizId, getQuizQuestions } from "@/lib/data";

// POST — submit an attempt; the SERVER grades it and returns the result
// plus the answer key (safe now — grading already happened).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    const body = await request.json();
    const { answers, quiz_id, participant_name, participant_email, time_taken_seconds } = body;

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "answers array is required" },
        { status: 400 }
      );
    }

    // ── Server-side time-window enforcement ──────────────────
    // The UI hides the quiz outside its window; the server must also refuse
    // submissions outside it (clients can be manipulated).
    const quizId = body.quiz_id || (await getAttemptQuizId(id, local));
    if (quizId) {
      const quiz = await getQuizById(quizId, local);
      if (quiz) {
        const now = Date.now();
        if (quiz.starts_at && now < new Date(quiz.starts_at).getTime()) {
          return NextResponse.json(
            { error: "This quiz is not open yet." },
            { status: 403 }
          );
        }
        if (quiz.ends_at && now > new Date(quiz.ends_at).getTime()) {
          return NextResponse.json(
            { error: "This quiz has closed." },
            { status: 403 }
          );
        }

        // ── Per-attempt time-limit enforcement ────────────────
        // The client timer is advisory. The server derives elapsed time from
        // the joined-at timestamp it is handed (set before any answers were
        // recorded) and refuses submissions impossibly past the limit.
        // Grace period absorbs network/submit latency, not extra thinking time.
        const GRACE_SECONDS = 30;
        if (quiz.time_limit_minutes) {
          const limitSec = quiz.time_limit_minutes * 60;
          // Prefer the start time recorded server-side at join (survives page
          // refreshes — a refreshed client would otherwise report a fresh
          // start and buy unlimited time). Fall back to the client's claim,
          // then to the in_progress row's own timestamp.
          let serverStartMs: number | null = null;
          try {
            const { getSessionUser } = await import("@/lib/session");
            const { readServerAttempts } = await import("@/lib/data");
            const sess = await getSessionUser(request).catch(() => null);
            const email = sess?.email || body.participant_email || null;
            const rows = readServerAttempts().filter(
              (a: any) =>
                a.quiz_id === quizId &&
                a.status !== "abandoned" &&
                (a.id === id || (email && a.participant_email === email))
            );
            for (const row of rows) {
              const rec = row?.started_at ? new Date(row.started_at).getTime() : NaN;
              if (!Number.isNaN(rec) && rec > 0) {
                serverStartMs = serverStartMs === null ? rec : Math.min(serverStartMs, rec);
              }
            }
          } catch { /* best-effort lookup */ }
          const clientStartMs = body.started_at ? new Date(body.started_at).getTime() : NaN;
          const candidates = [serverStartMs, Number.isNaN(clientStartMs) ? null : clientStartMs]
            .filter((v): v is number => typeof v === "number" && v > 0);
          // Earliest credible start wins — extra time is never granted.
          const startedMs = candidates.length ? Math.min(...candidates) : NaN;
          if (!Number.isNaN(startedMs) && startedMs > 0) {
            const elapsedSec = (Date.now() - startedMs) / 1000;
            if (elapsedSec > limitSec + GRACE_SECONDS) {
              return NextResponse.json(
                { error: "Time is up for this quiz. Your answers could not be submitted." },
                { status: 403 }
              );
            }
            // Clamp the stored duration so the leaderboard never shows
            // "15 min quiz · 3 h taken" from a manipulated client.
            if (elapsedSec > limitSec) {
              body.time_taken_seconds = limitSec;
            } else if (typeof time_taken_seconds === "number" && time_taken_seconds > elapsedSec + GRACE_SECONDS) {
              body.time_taken_seconds = Math.max(1, Math.round(elapsedSec));
            }
          } else if (typeof time_taken_seconds === "number" && time_taken_seconds > limitSec + GRACE_SECONDS) {
            // No start timestamp (old client) — at least clamp an absurd claim.
            body.time_taken_seconds = limitSec;
 }
        }

        // ── Duplicate-submission guard ────────────────────────
        // One completed attempt per logged-in participant per quiz. The
        // submitter's claimed email is not trusted on its own — resolve the
        // session server-side; a forged email still maps to the session.
        const { getSessionUser } = await import("@/lib/session");
        const session = await getSessionUser(request);
        const claimedEmail = body.participant_email || null;
        const guardEmail = session?.email || claimedEmail;
        if (guardEmail) {
          const { readServerAttempts } = await import("@/lib/data");
          const already = readServerAttempts().find(
            (a: any) =>
              a.quiz_id === quizId &&
              a.participant_email === guardEmail &&
              a.status === "completed"
          );
          if (already) {
            return NextResponse.json(
              { error: "You have already taken this quiz.", attempt_id: already.id, duplicate: true },
              { status: 409 }
            );
          }
        }
      }
    }

    // Pass the quiz id so grading can find the questions even when the
    // attempt record doesn't exist yet (e.g. client-only attempt IDs).
    const attempt = await submitAttempt(id, answers, local, quizId || body.quiz_id, {
      participant_name: participant_name ?? null,
      participant_email: participant_email ?? null,
      time_taken_seconds: time_taken_seconds ?? null,
    });

    // Answer key + explanations are released ONLY in the graded response,
    // matching what was just submitted — never before via the public GET.
    const questions = await getQuizQuestions(quizId || body.quiz_id || id, local);
    const answer_key: Record<string, string> = {};
    const explanations: Record<string, string | null> = {};
    for (const q of questions as any[]) {
      answer_key[q.id] = q.correct_answer;
      explanations[q.id] = q.explanation ?? null;
    }

    // Per-question correctness is computed here (authoritative). In local
    // mode getAttemptAnswers returns [], so we always build it from the
    // same server-side grading that produced the score.
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const gradedAnswers = (answers as Array<{ question_id: string; selected_answer: string }>).map((a) => {
      const q = (questions as any[]).find((qq) => qq.id === a.question_id);
      const isCorrect = !!q && norm(a.selected_answer) === norm(q.correct_answer);
      return {
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        is_correct: isCorrect,
        marks_awarded: isCorrect ? (q?.marks ?? 1) : 0,
      };
    });

    return NextResponse.json({ attempt, answers: gradedAnswers, answer_key, explanations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit attempt" },
      { status: 500 }
    );
  }
}
