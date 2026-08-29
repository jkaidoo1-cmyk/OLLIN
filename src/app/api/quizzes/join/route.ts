import { NextRequest, NextResponse } from "next/server";
import { getQuizByCode, getQuizQuestions } from "@/lib/data";

// POST — join a quiz by share code
export async function POST(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const { code, participant_name } = body;

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "Quiz code is required" },
        { status: 400 }
      );
    }

    const quiz = await getQuizByCode(code.trim().toUpperCase(), demo);

    if (!quiz) {
      return NextResponse.json(
        { error: "Quiz not found. Check the code and try again." },
        { status: 404 }
      );
    }

    if (quiz.status === "draft" || quiz.status === "archived") {
      return NextResponse.json(
        { error: "This quiz is not available yet." },
        { status: 403 }
      );
    }

    // Get questions without correct answers
    const allQuestions = await getQuizQuestions(quiz.id, demo);
    const questions = allQuestions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks,
      order_index: q.order_index,
    }));

    return NextResponse.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        time_limit_minutes: quiz.time_limit_minutes,
        max_attempts: quiz.max_attempts,
        shuffle_questions: quiz.shuffle_questions,
        passing_score: quiz.passing_score,
        total_questions: questions.length,
      },
      questions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to join quiz" },
      { status: 500 }
    );
  }
}
