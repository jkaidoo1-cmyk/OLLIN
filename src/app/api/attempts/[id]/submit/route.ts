import { NextRequest, NextResponse } from "next/server";
import { submitAttempt, getAttemptAnswers } from "@/lib/data";

// POST — submit an attempt with all answers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { id } = await params;
    const body = await request.json();
    const { answers } = body;

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "answers array is required" },
        { status: 400 }
      );
    }

    const attempt = await submitAttempt(id, answers, demo);
    const savedAnswers = await getAttemptAnswers(id, demo);

    return NextResponse.json({ attempt, answers: savedAnswers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit attempt" },
      { status: 500 }
    );
  }
}
