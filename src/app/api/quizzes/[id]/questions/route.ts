import { NextRequest, NextResponse } from "next/server";
import { getQuizQuestions } from "@/lib/data";

// GET — get questions for a quiz (without correct answers for participants)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const showAnswers = request.nextUrl.searchParams.get("show_answers") === "true";
    const { id } = await params;

    const questions = await getQuizQuestions(id, demo);

    if (!showAnswers) {
      const stripped = questions.map((q) => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        topic: q.topic,
        difficulty: q.difficulty,
        marks: q.marks,
        order_index: q.order_index,
      }));
      return NextResponse.json({ questions: stripped });
    }

    return NextResponse.json({ questions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch questions" },
      { status: 500 }
    );
  }
}
