import type { NextRequest } from "next/server";
import { Quiz } from "./types";
import { getSessionUser } from "./session";
import { isEphemeralHost, isLocalRequest } from "./server-host";
import { readServerQuizzes } from "./data";

/**
 * The quiz list one caller is allowed to see.
 *
 * Shared by /api/quizzes and /api/quizzes/delta so the delta diffs exactly the
 * set the full endpoint returns — otherwise "removed" would mean something
 * different in the two screens.
 *
 * Returns null when the caller is not signed in (and not on a loopback host),
 * which both routes turn into a 401.
 */
export async function readVisibleQuizzes(request: NextRequest): Promise<Quiz[] | null> {
  const local = isLocalRequest(request);
  // Every caller of this list is a signed-in screen. Without a session there is
  // nothing to list, and an anonymous caller could sweep every published share
  // code in one request. File mode on a real server keeps working without one.
  const session = await getSessionUser(request).catch(() => null);
  if (!session && !local) return null;

  let quizzes: Quiz[] = [];

  // File store only where the filesystem persists. On a serverless host it is
  // read-only and empty, so reading it here served zero quizzes and made the
  // admin list look wiped.
  if (!isEphemeralHost()) {
    try {
      quizzes = readServerQuizzes();
    } catch {
      quizzes = [];
    }
  }

  // Merge in Supabase quizzes (admin client — reads all published quizzes)
  if (!local) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const { data, error } = await admin
          .from("quizzes")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && data) {
          // Admins also need drafts and archived rows; everyone else
          // (including participants) only ever sees published quizzes.
          const rows = data as unknown as Quiz[];
          const isAdmin = session?.role === "admin";
          const published = isAdmin ? rows : rows.filter((q) => q.status === "published");
          const sbIds = new Set(published.map((q) => q.id));
          const merged: Quiz[] = published.map((q) => ({ ...q, share_code: q.share_code }));
          for (const fq of quizzes) {
            if (!sbIds.has(fq.id)) merged.push(fq);
          }
          quizzes = merged;
        }
      }
    } catch {
      /* Supabase optional */
    }
  }

  return quizzes;
}

/** Participant-safe shape: no correct answers or explanations. */
export function stripQuestionData(q: Quiz) {
  return {
    id: q.id,
    host_id: q.host_id,
    title: q.title,
    description: q.description,
    share_code: q.share_code,
    time_limit_minutes: q.time_limit_minutes,
    max_attempts: q.max_attempts,
    show_answers_after: q.show_answers_after,
    shuffle_questions: q.shuffle_questions,
    shuffle_options: q.shuffle_options,
    passing_score: q.passing_score,
    starts_at: q.starts_at,
    ends_at: q.ends_at,
    status: q.status,
    course_id: q.course_id,
    created_at: q.created_at,
    updated_at: q.updated_at,
  };
}
