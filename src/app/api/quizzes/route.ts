import { NextRequest, NextResponse } from "next/server";
import { createQuiz, getUserQuizzes } from "@/lib/data";

// GET — list user's quizzes
export async function GET(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const quizzes = await getUserQuizzes(demo);
    return NextResponse.json({ quizzes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch quizzes" },
      { status: 500 }
    );
  }
}

// POST — create a new quiz with questions
export async function POST(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const { title, description, time_limit_minutes, questions } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Quiz title is required" }, { status: 400 });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "At least one question is required" }, { status: 400 });
    }

    const result = await createQuiz(
      {
        title: title.trim(),
        description: description || undefined,
        time_limit_minutes: time_limit_minutes || undefined,
        questions,
      },
      demo
    );

    return NextResponse.json({
      quiz: result.quiz,
      code: result.code,
    });
  } catch (error) {
    console.error("Quiz creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quiz" },
      { status: 500 }
    );
  }
}
