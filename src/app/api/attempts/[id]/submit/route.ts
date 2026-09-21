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
