import { NextRequest, NextResponse } from "next/server";
import {
  readSavedQuizzes,
  writeSavedQuizzes,
  type SavedQuizLink,
} from "@/lib/local-saved-quizzes";
import { getSessionAdmin } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Saved quiz↔course links.
 * - Supabase configured → read/write the `saved_quizzes` table (service-role writes).
 * - Otherwise → the server-side JSON file (single source of truth in file mode).
 */

async function sbReadSaved(): Promise<SavedQuizLink[] | null> {
  const supabase = await createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("saved_quizzes")
    .select("quiz_id, course_id, saved_at");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    quiz_id: r.quiz_id,
    course_id: r.course_id,
    saved_at: r.saved_at,
  }));
}

// GET — list all saved quiz↔course links (public read; students use this)
export async function GET() {
  try {
    const sb = await sbReadSaved();
    if (sb) return NextResponse.json({ saved: sb });
    return NextResponse.json({ saved: readSavedQuizzes() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch saved quizzes" },
      { status: 500 }
    );
  }
}

// POST — save a quiz to a course (idempotent) — admin only
export async function POST(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  try {
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const body = await request.json();
    const { quiz_id, course_id } = body;

    if (!quiz_id || !course_id) {
      return NextResponse.json(
        { error: "quiz_id and course_id are required" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();
    if (supabase) {
      // Insert is idempotent thanks to the unique(quiz_id, course_id) constraint.
      const { error } = await supabase
        .from("saved_quizzes")
        .upsert(
          { quiz_id, course_id },
          { onConflict: "quiz_id,course_id", ignoreDuplicates: true }
        );
      if (error) throw new Error(error.message);
      await recordAdminAction(request, admin, "quiz.save", "quiz", quiz_id, `Saved quiz to course ${course_id}`);
      return NextResponse.json({ success: true });
    }

    const links = readSavedQuizzes();
    if (!links.some((l) => l.quiz_id === quiz_id && l.course_id === course_id)) {
      links.push({ quiz_id, course_id, saved_at: new Date().toISOString() });
      writeSavedQuizzes(links);
    }
    await recordAdminAction(request, admin, "quiz.save", "quiz", quiz_id, `Saved quiz to course ${course_id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save quiz" },
      { status: 500 }
    );
  }
}

// DELETE — remove a quiz from a course — admin only
export async function DELETE(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  try {
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const quiz_id = searchParams.get("quiz_id");
    const course_id = searchParams.get("course_id");

    if (!quiz_id || !course_id) {
      return NextResponse.json(
        { error: "quiz_id and course_id are required" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();
    if (supabase) {
      const { error } = await supabase
        .from("saved_quizzes")
        .delete()
        .eq("quiz_id", quiz_id)
        .eq("course_id", course_id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }

    const links = readSavedQuizzes().filter(
      (l) => !(l.quiz_id === quiz_id && l.course_id === course_id)
    );
    writeSavedQuizzes(links);
    await recordAdminAction(request, admin, "quiz.unsave", "quiz", quiz_id, `Removed quiz from course ${course_id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unsave quiz" },
      { status: 500 }
    );
  }
}
