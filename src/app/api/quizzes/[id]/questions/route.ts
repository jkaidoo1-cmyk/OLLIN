import { NextRequest, NextResponse } from "next/server";
import { getQuizQuestions, getQuizById } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

// GET — get questions for a quiz (without correct answers for participants)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const showAnswers = request.nextUrl.searchParams.get("show_answers") === "true";
    const { id } = await params;

    // Correct answers may only be fetched by the quiz creator or an admin.
    // Everyone else (participants, guests, anonymous) always gets stripped questions.
    if (showAnswers) {
      const quiz = await getQuizById(id, local);
      const session = await getSessionUser(request);
      const isCreator = !!session && !!quiz && session.id === quiz.host_id;
      const isAdmin = !!session && session.role === "admin";
      if (!isCreator && !isAdmin) {
        return NextResponse.json(
          { error: "Not authorized to view answers for this quiz" },
          { status: 403 }
        );
      }
    }

    const questions = await getQuizQuestions(id, local);

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
      { error: error instanceof Error ? error.message : "Failed to load questions" },
      { status: 500 }
    );
  }
}
