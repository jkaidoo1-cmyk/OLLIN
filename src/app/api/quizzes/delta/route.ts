import { NextRequest, NextResponse } from "next/server";
import { readVisibleQuizzes, stripQuestionData } from "@/lib/quizzes-list";
import { diffRows, parseKnownIds, parseSince } from "@/lib/list-delta";
import { serverError } from "@/lib/api-errors";

/**
 * GET /api/quizzes/delta?known=<ids>&since=<iso>
 *
 * The list-changed-since-last-time form of /api/quizzes. `known` carries the
 * ids the client already has, `since` the server time of its last sync; the
 * answer holds only new or edited rows plus the ids that disappeared.
 *
 * With neither parameter it behaves like the full list. The response is never
 * cached (a delta body is meaningless as a standalone list), and it is kept out
 * of the service worker's offline list for the same reason.
 */
export async function GET(request: NextRequest) {
  try {
    const quizzes = await readVisibleQuizzes(request);
    if (!quizzes) {
      return NextResponse.json({ error: "Sign in to view quizzes." }, { status: 401 });
    }

    const known = parseKnownIds(request.nextUrl.searchParams.get("known"));
    const since = parseSince(request.nextUrl.searchParams.get("since"));
    const rows = quizzes.map(stripQuestionData);
    const delta = diffRows(rows, known, since);

    return NextResponse.json(
      {
        delta: !delta.full,
        quizzes: delta.changed,
        removed: delta.removed,
        unchanged: delta.unchanged,
        // Overlap the stamp by a few seconds: a row written while this list was
        // being read would otherwise sit just before the client's `since` and
        // never be sent. Re-sending a row is harmless; missing one is not.
        synced_at: new Date(Date.now() - 5_000).toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return serverError("quizzes.delta", error, {
      message: "We couldn't check for quiz updates. Refresh the page and try again.",
    });
  }
}
