import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { serverError } from "@/lib/api-errors";
import { readMyQuizzes, type CourseRow } from "@/lib/my-quizzes-list";
import { diffRows, parseKnownIds, parseSince } from "@/lib/list-delta";

/**
 * GET /api/my-quizzes/delta?known=<ids>&since=<iso>
 *
 * "My quizzes" with only the difference: the caller's cached ids and last sync
 * time in, new/edited quizzes and vanished ids out. Courses travel along in
 * full — the catalogue is small and near-static.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { quizzes, courses } = await readMyQuizzes(session);
    const known = parseKnownIds(request.nextUrl.searchParams.get("known"));
    const since = parseSince(request.nextUrl.searchParams.get("since"));
    const delta = diffRows(quizzes, known, since);

    return NextResponse.json(
      {
        delta: !delta.full,
        quizzes: delta.changed,
        removed: delta.removed,
        unchanged: delta.unchanged,
        courses: courses as CourseRow[],
        synced_at: new Date(Date.now() - 5_000).toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return serverError("quizzes.mine.delta", error, {
      message: "We couldn't check for quiz updates. Refresh the page and try again.",
    });
  }
}
