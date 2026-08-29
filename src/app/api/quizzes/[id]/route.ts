import { NextRequest, NextResponse } from "next/server";
import { getQuizById, getQuizByCode, deleteQuiz, getQuizQuestions } from "@/lib/data";

// GET — get quiz by ID or share code, with questions (public, no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const demo = request.headers.get("x-demo-mode") === "true" || !request.headers.get("authorization");

    // Try by ID first, then by share code
    let quiz = await getQuizById(id, demo);
    if (!quiz) {
      quiz = await getQuizByCode(id, demo);
    }

    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const questions = await getQuizQuestions(quiz.id, demo);

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
    const demo = request.headers.get("x-demo-mode") === "true";
    const { id } = await params;
    await deleteQuiz(id, demo);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete quiz" },
      { status: 500 }
    );
  }
}
