import { NextRequest, NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/session";
import { readServerAttempts, writeServerAttempts } from "@/lib/data";

/**
 * Admin maintenance: abandoned in_progress attempts.
 *
 * A student who opens a quiz and never submits leaves an in_progress row
 * behind. These phantoms clutter My attempts, the creator's roster and the
 * leaderboard data with 0% entries. Anything still in_progress after 24h
 * can never be submitted (the time limit + grace period long expired), so
 * it is safely abandoned and can be purged.
 *
 * GET    — preview: how many rows are stale, with a small breakdown.
 * DELETE — purge every stale row; returns the new totals.
 */

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // one day

function findStale(attempts: any[], now = Date.now()) {
  return attempts.filter(
    (a) =>
      a.status === "in_progress" &&
      (() => {
        const ts = a.started_at || a.created_at;
        const ms = ts ? new Date(ts).getTime() : NaN;
        return !Number.isNaN(ms) && now - ms > STALE_AFTER_MS;
      })()
  );
}

export async function GET(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  try {
    const attempts = readServerAttempts();
    const stale = findStale(attempts);
    const inProgress = attempts.filter((a: any) => a.status === "in_progress");
    return NextResponse.json({
      stale_count: stale.length,
      in_progress_count: inProgress.length,
      stale: stale.map((a: any) => ({
        id: a.id,
        quiz_id: a.quiz_id,
        participant_name: a.participant_name,
        participant_email: a.participant_email || null,
        started_at: a.started_at || a.created_at || null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan attempts" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  try {
    const attempts = readServerAttempts();
    const stale = findStale(attempts);
    if (!stale.length) {
      return NextResponse.json({ removed: 0, remaining_attempts: attempts.length });
    }
    const staleIds = new Set(stale.map((a: any) => a.id));
    const kept = attempts.filter((a: any) => !staleIds.has(a.id));
    writeServerAttempts(kept);
    return NextResponse.json({
      removed: stale.length,
      remaining_attempts: kept.length,
      removed_ids: [...staleIds],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to purge attempts" },
      { status: 500 }
    );
  }
}
