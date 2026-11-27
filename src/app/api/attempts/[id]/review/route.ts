import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts, getQuizQuestions } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { isLocalRequest } from "@/lib/server-host";
import { serverError } from "@/lib/api-errors";

/**
 * GET /api/attempts/[id]/review — question-by-question review for ONE attempt.
 *
 * Only the participant who made the attempt or an admin may read it. Returns
 * the full questions including correct answers and explanations — safe because
 * access is scoped to the attempt owner, unlike the general questions endpoint
 * which strips answers.
 *
 * The attempt is read from the store it lives in: quiz_attempts/attempt_answers
 * in the database, or the file store on a local host. Reading only the file
 * store returned 404 for every deployed attempt, so "Review answers" never
 * opened on the live site.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const local = isLocalRequest(request);
    let quizId = "";
    let answers: Record<string, string> = {};
    let ownsIt = false;

    if (!local) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (admin) {
          const { data: row } = await admin
            .from("quiz_attempts")
            .select("id,quiz_id,participant_id,participant_name,status")
            .eq("id", id)
            .maybeSingle();
          if (row) {
            quizId = row.quiz_id;
            // Ownership is the stored participant id, never a client claim.
            ownsIt = row.participant_id === session.id || session.role === "admin";
            const { data: answerRows } = await admin
              .from("attempt_answers")
              .select("question_id,selected_answer")
              .eq("attempt_id", id);
            for (const a of (answerRows ?? []) as Array<{ question_id: string; selected_answer: string | null }>) {
              answers[a.question_id] = a.selected_answer ?? "";
            }
          }
        }
      } catch {
        /* fall back to the file store below */
      }
    }

    if (!quizId) {
      const attempt = readServerAttempts().find((a) => a.id === id) as
        | { id: string; quiz_id: string; participant_email?: string | null; answers?: unknown }
        | undefined;
      if (!attempt) {
        return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
      }
      quizId = attempt.quiz_id;
      const raw = attempt.answers;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        answers = raw as Record<string, string>;
      }
      const isOwner = !!attempt.participant_email && attempt.participant_email === session.email;
      ownsIt = isOwner || session.role === "admin";
    }

    if (!ownsIt) {
      return NextResponse.json({ error: "Not your attempt" }, { status: 403 });
    }

    // Questions follow the same store as the attempt: the file store may be
    // empty on a deployed host, where the quiz lives in the database.
    let questions = await getQuizQuestions(quizId, local);
    if (questions.length === 0) questions = await getQuizQuestions(quizId, false);
    if (questions.length === 0) questions = await getQuizQuestions(quizId, true);

    return NextResponse.json({
      attempt: { id, quiz_id: quizId, answers },
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        type: q.question_type,
      })),
    });
  } catch (error) {
    return serverError("attempts.review", error, {
      message: "We couldn't load the answer review. Refresh the page and try again.",
    });
  }
}
