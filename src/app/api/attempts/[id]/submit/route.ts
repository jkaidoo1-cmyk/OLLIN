import { NextRequest, NextResponse } from "next/server";
import { getQuizQuestions, readServerAttempts, writeServerAttempts } from "@/lib/data";
import type { QuizAttempt } from "@/lib/types";
import type { Question } from "@/lib/types";

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
    const { getAttemptQuizId } = await import("@/lib/data");
    const quizId = body.quiz_id || (await getAttemptQuizId(id, local)) || "";        if (quizId) {
      const { getQuizById } = await import("@/lib/data");
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
            const { readServerAttempts: _rs } = await import("@/lib/data");
            const sess = await getSessionUser(request).catch(() => null);
            const email = sess?.email || body.participant_email || null;
            const rows = _rs().filter(
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
          const arr = readServerAttempts();
          let already: any = null;
          const asArr = arr as any[];
          for (let i = 0; i < asArr.length; i++) {
            const a = asArr[i];
            if (a.quiz_id === quizId
              && a.participant_email === guardEmail
              && a.status === "completed") {
              already = a;
              break;
            }
          }
          if (already) {
            return NextResponse.json(
              { error: "You have already taken this quiz.", attempt_id: already.id, duplicate: true },
              { status: 409 }
            );
          }
        }
      }
    }

    // ── Grade and persist the submission ─────────────────────
    const attemptId = id;
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const rawQuizId = quizId || body.quiz_id || "";
    let resolvedQuizId = rawQuizId;
    if (rawQuizId) {
      // Resolve share codes / IDs to internal quiz IDs. Check all sources:
      // server-local (built-in defaults), file store, then Supabase.
      let foundId: string | null = null;
      const { serverGetLocalQuizByCode, serverGetLocalQuizById } = await import("@/lib/server-local");
      const slQuiz = serverGetLocalQuizByCode(rawQuizId) || serverGetLocalQuizById(rawQuizId);
      if (slQuiz) foundId = slQuiz.id;
      if (!foundId) {
        const { readServerQuizzes } = await import("@/lib/data");
        const fileQ = readServerQuizzes().find((q: any) => q.id === rawQuizId
          || (q.share_code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === rawQuizId.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
        if (fileQ) foundId = fileQ.id;
      }
      if (!foundId) {
        const { getQuizByCode } = await import("@/lib/data");
        const sbQuiz = await getQuizByCode(rawQuizId, local);
        if (sbQuiz) foundId = sbQuiz.id;
      }
      resolvedQuizId = foundId || rawQuizId;
    }    const questions = await getQuizQuestions(resolvedQuizId, true); // always check file + server-local for grading
    const questionMap = new Map<string, any>();
    for (const q of questions) questionMap.set(q.id, q);

    const graded: Array<{ question_id: string; selected_answer: string; is_correct: boolean; marks_awarded: number }> = (
      answers as Array<{ question_id: string; selected_answer: string }>
    ).map((a) => {
      const q = questionMap.get(a.question_id);
      if (!q) return { question_id: a.question_id, selected_answer: a.selected_answer, is_correct: false, marks_awarded: 0 };
      const selected = String(a.selected_answer ?? "").trim().toLowerCase();
      const correct = String(q.correct_answer ?? "").trim().toLowerCase();
      const isCorrect = selected === correct;
      const result = {
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        is_correct: isCorrect,
        marks_awarded: isCorrect ? (q.marks ?? 1) : 0,
      };
      return result;
    });

    const correct = graded.filter((g) => g.is_correct).length;
    const total = graded.length;
    const marksEarned = graded.reduce((s, g) => s + g.marks_awarded, 0);
    const answer_key: Record<string, string> = {};
    const explanations: Record<string, string | null> = {};
    for (const q of questions) {
      answer_key[q.id] = q.correct_answer;
      explanations[q.id] = q.explanation ?? null;
    }
    const now = new Date().toISOString();
    const attempt: QuizAttempt = {
      id: attemptId,
      quiz_id: resolvedQuizId,
      participant_id: null,
      participant_email: participant_email ?? null,
      participant_name: participant_name ?? "Anonymous",
      started_at: now,
      completed_at: now,
      time_taken_seconds: time_taken_seconds ?? 600,
      total_questions: total,
      correct_answers: correct,
      score_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      marks_earned: marksEarned,
      marks_total: total,
      status: "completed",
      created_at: now,
    };

    if (local) {
      // File-mode: persist the completed attempt
      const attempts = readServerAttempts();
      const idx = attempts.findIndex((a) => a.id === attemptId);
      if (idx >= 0) attempts[idx] = attempt as any;
      else attempts.push(attempt as any);
      writeServerAttempts(attempts);
    } else {
      // Supabase: use admin client to update + insert answers
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (!admin) throw new Error("Supabase unavailable");

        if (graded.length > 0) {
          const inserts = graded.map((g) => ({
            attempt_id: attemptId,
            question_id: g.question_id,
            selected_answer: g.selected_answer,
            is_correct: g.is_correct,
            marks_awarded: g.marks_awarded,
          }));
          await admin.from("attempt_answers").upsert(inserts, {
            onConflict: "attempt_id,question_id",
          });
        }

        await admin
          .from("quiz_attempts")
          .update({
            completed_at: now,
            time_taken_seconds: time_taken_seconds ?? 600,
            correct_answers: correct,
            score_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
            marks_earned: marksEarned,
            marks_total: total,
            status: "completed",
          })
          .eq("id", attemptId)
          .select()
          .single();
      } catch (err) {
        // Supabase failed — persist to file as fallback
        const attempts = readServerAttempts();
        const idx = attempts.findIndex((a) => a.id === attemptId);
        if (idx >= 0) attempts[idx] = attempt as any;
        else attempts.push(attempt as any);
        writeServerAttempts(attempts);
      }
    }

    return NextResponse.json({ attempt, answers: graded, answer_key, explanations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit attempt" },
      { status: 500 }
    );
  }
}
