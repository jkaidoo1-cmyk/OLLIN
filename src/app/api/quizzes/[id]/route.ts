import { NextRequest, NextResponse } from "next/server";
import { getQuizById, getQuizByCode, deleteQuiz, getQuizQuestions } from "@/lib/data";

// GET — get quiz by ID or share code, with questions (public, no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const local = request.headers.get("x-local-mode") === "true" || !request.headers.get("authorization");

    // Try by ID first, then by share code
    let quiz = await getQuizById(id, local);
    if (!quiz) {
      quiz = await getQuizByCode(id, local);
    }

    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const questions = await getQuizQuestions(quiz.id, local);

    return NextResponse.json({ quiz, questions });
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
