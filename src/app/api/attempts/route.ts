import { NextRequest, NextResponse } from "next/server";
import { readServerAttempts, writeServerAttempts } from "@/lib/data";

/**
 * GET /api/attempts?quiz_id=xxx — Fetch server-side attempts for a quiz
 */
export async function GET(request: NextRequest) {
  try {
    const quizId = request.nextUrl.searchParams.get("quiz_id");
    const allAttempts = readServerAttempts();

    if (quizId) {
      // Single quiz
      const quizAttempts = allAttempts.filter((a) => a.quiz_id === quizId);
      return NextResponse.json({ attempts: quizAttempts });
    }

    // All attempts (no filter)
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
    } = body;

    if (!quiz_id) {
      return NextResponse.json({ error: "quiz_id is required" }, { status: 400 });
    }

    const attempt = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quiz_id,
      participant_id: null,
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
      created_at: new Date().toISOString(),
    };

    const attempts = readServerAttempts();
    attempts.push(attempt);
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
