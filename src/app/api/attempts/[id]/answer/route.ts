import { NextRequest, NextResponse } from "next/server";
import { saveAnswer } from "@/lib/data";

// POST — save a single answer during quiz (autosave)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { id } = await params;
    const body = await request.json();
    const { question_id, selected_answer, is_correct, marks_awarded } = body;

    if (!question_id || selected_answer === undefined) {
      return NextResponse.json(
        { error: "question_id and selected_answer are required" },
        { status: 400 }
      );
    }

    await saveAnswer(
      id,
      question_id,
      selected_answer,
      is_correct || false,
      marks_awarded || 0,
      demo
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save answer" },
      { status: 500 }
    );
  }
}
