import { NextRequest, NextResponse } from "next/server";
import {
  readSavedQuizzes,
  writeSavedQuizzes,
} from "@/lib/demo-saved-quizzes";

// GET — list all saved quiz↔course links
export async function GET() {
  try {
    const links = readSavedQuizzes();
    return NextResponse.json({ saved: links });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch saved quizzes" },
      { status: 500 }
    );
  }
}

// POST — save a quiz to a course (idempotent)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quiz_id, course_id } = body;

    if (!quiz_id || !course_id) {
      return NextResponse.json(
        { error: "quiz_id and course_id are required" },
        { status: 400 }
      );
    }

    const links = readSavedQuizzes();
    if (!links.some((l) => l.quiz_id === quiz_id && l.course_id === course_id)) {
      links.push({ quiz_id, course_id, saved_at: new Date().toISOString() });
      writeSavedQuizzes(links);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save quiz" },
      { status: 500 }
    );
  }
}

// DELETE — remove a quiz from a course
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const quiz_id = searchParams.get("quiz_id");
    const course_id = searchParams.get("course_id");

    if (!quiz_id || !course_id) {
      return NextResponse.json(
        { error: "quiz_id and course_id are required" },
        { status: 400 }
      );
    }

    const links = readSavedQuizzes().filter(
      (l) => !(l.quiz_id === quiz_id && l.course_id === course_id)
    );
    writeSavedQuizzes(links);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unsave quiz" },
      { status: 500 }
    );
  }
}
