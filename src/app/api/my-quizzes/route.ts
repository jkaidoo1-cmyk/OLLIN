import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { serverError } from "@/lib/api-errors";

/**
 * GET /api/my-quizzes — the signed-in user's own quizzes, plus the course list
 * the page filters them by, in one round trip.
 *
 * The My quizzes screen used to resolve its session through the Supabase auth
 * client and then issue two more queries in sequence, so switching to it waited
 * on three network round trips with nothing painted. The session cookie already
 * identifies the caller here, and quizzes and courses travel together, so one
 * request with one query per table (in parallel) replaces that waterfall.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    type Row = Record<string, unknown>;
    let quizzes: Row[] = [];
    let courses: Row[] = [];

    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const [quizResult, courseResult] = await Promise.all([
          admin
            .from("quizzes")
            .select("*")
            .eq("host_id", session.id)
            .order("created_at", { ascending: false }),
          admin.from("courses").select("*"),
        ]);
        if (!quizResult.error && quizResult.data) quizzes = quizResult.data as Row[];
        if (!courseResult.error && courseResult.data) courses = courseResult.data as Row[];
      }
    } catch (error) {
      console.error("my-quizzes: Supabase read failed", error);
    }

    // Quizzes kept in the file store (local/dev hosts, or older rows) belong to
    // the same person and would otherwise look deleted.
    try {
      const { readServerQuizzes } = await import("@/lib/data");
      const seen = new Set(quizzes.map((q) => q.id));
      for (const q of readServerQuizzes() as unknown as Row[]) {
        if (q.host_id === session.id && !seen.has(q.id)) quizzes.push(q);
      }
    } catch (error) {
      console.error("my-quizzes: file store read failed", error);
    }

    return NextResponse.json(
      { quizzes, courses },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return serverError("quizzes.mine", error, {
      message: "We couldn't load your quizzes. Refresh the page and try again.",
    });
  }
}
