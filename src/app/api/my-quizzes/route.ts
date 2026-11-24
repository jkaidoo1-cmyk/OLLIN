import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { serverError } from "@/lib/api-errors";
import { readMyQuizzes } from "@/lib/my-quizzes-list";

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

    const { quizzes, courses } = await readMyQuizzes(session);

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
