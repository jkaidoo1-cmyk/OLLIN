import { NextRequest, NextResponse } from "next/server";
import { getQuizById, getQuizByCode, deleteQuiz, getQuizQuestions } from "@/lib/data";

// GET — get quiz by ID or share code, with questions (public, no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    // Users type codes on their phone in any form: "cez772", "cez-772",
    // " CEZ-772 ". Normalize (strip non-alphanumerics, uppercase) before
    // matching — stored codes compare in the same normalized form.
    const norm = rawId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const id = norm || rawId;

    const local = request.headers.get("x-local-mode") === "true" || !request.headers.get("authorization");

    // Try by ID first (deep links), then by normalized share code
    let quiz = await getQuizById(rawId, local);
    if (!quiz) {
      quiz = await getQuizByCode(norm, local);
    }

    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const questions = await getQuizQuestions(quiz.id, local);

    // SECURITY: this endpoint is public (guests join by code). Correct
    // answers and explanations must never reach the browser before the
    // attempt is graded — they're the quiz's answer key.
    const publicQuestions = questions.map((q: any) => {
      const { correct_answer, explanation, ...safe } = q;
      return safe;
    });

    return NextResponse.json({ quiz, questions: publicQuestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch quiz" },
      { status: 500 }
    );
  }
}

// DELETE — delete a quiz
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { id } = await params;
    await deleteQuiz(id, local);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete quiz" },
      { status: 500 }
    );
  }
}
