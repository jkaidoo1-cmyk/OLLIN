import { Course, Quiz } from "./types";

/**
 * The signed-in user's own quizzes plus the course list their page filters by.
 *
 * Shared by /api/my-quizzes and /api/my-quizzes/delta. Both tables are read in
 * parallel: this screen used to resolve the session through Supabase auth and
 * then issue two more queries in sequence, so opening it waited on three round
 * trips with nothing painted.
 */

export type MyQuizRow = Quiz & { [key: string]: unknown };
export type CourseRow = Course & { [key: string]: unknown };

export async function readMyQuizzes(session: {
  id: string;
}): Promise<{ quizzes: MyQuizRow[]; courses: CourseRow[] }> {
  let quizzes: MyQuizRow[] = [];
  let courses: CourseRow[] = [];

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
      if (!quizResult.error && quizResult.data) quizzes = quizResult.data as MyQuizRow[];
      if (!courseResult.error && courseResult.data) courses = courseResult.data as CourseRow[];
    }
  } catch (error) {
    console.error("my-quizzes: Supabase read failed", error);
  }

  // Quizzes kept in the file store (local/dev hosts, or older rows) belong to
  // the same person and would otherwise look deleted.
  try {
    const { readServerQuizzes } = await import("@/lib/data");
    const seen = new Set(quizzes.map((q) => q.id));
    for (const q of readServerQuizzes() as unknown as MyQuizRow[]) {
      if (q.host_id === session.id && !seen.has(q.id)) quizzes.push(q);
    }
  } catch (error) {
    console.error("my-quizzes: file store read failed", error);
  }

  return { quizzes, courses };
}
