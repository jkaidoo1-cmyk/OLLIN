"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLocalUser } from "@/lib/local";
import { Quiz, Course } from "@/lib/types";
import { SkeletonList } from "@/components/Skeleton";
import { QuizViewSwitcher } from "@/components/QuizViewSwitcher";
import { getResource, warmResource } from "@/lib/prefetch";
import { loadQuizzes } from "@/lib/quizzes-sync";
import { fetchAndSaveQuizBundle } from "@/lib/offline-quiz";
import { BookOpen, ChevronDown, Clock, Play, Search, Share2, Check } from "lucide-react";

interface CourseWithQuizzes {
  course: Course;
  quizzes: Quiz[];
}

/**
 * Test quizzes — admin-saved quizzes for the student's courses.
 * All data is read from the server APIs (single source of truth):
 *   - /api/saved-quizzes  → quiz ↔ course links saved by the admin
 *   - /api/courses        → courses, filtered by the student's year
 *   - /api/quizzes        → quiz metadata (title, code, time limit)
 */

/**
 * Group admin-saved quiz links under the courses this student may see.
 * Pure, so the cached paint and the delta refresh build the same list.
 */
function buildCourseGroups(
  savedLinks: Array<{ quiz_id: string; course_id: string }>,
  allCourses: Course[],
  allQuizzes: Quiz[]
): CourseWithQuizzes[] {
  // Filter courses by the student's current year (when known)
  const user = getLocalUser();
  const studentYear = user?.current_year;
  const yearCourses = studentYear
    ? allCourses.filter((c) => !c.year || c.year === studentYear)
    : allCourses;

  // Group admin-saved quizzes under their courses
  const quizById = new Map(allQuizzes.map((q) => [q.id, q]));
  const courseMap = new Map<string, Quiz[]>();
  for (const link of savedLinks) {
    const quiz = quizById.get(link.quiz_id);
    if (!quiz || quiz.status === "draft") continue;
    if (!courseMap.has(link.course_id)) courseMap.set(link.course_id, []);
    courseMap.get(link.course_id)!.push(quiz);
  }

  const result: CourseWithQuizzes[] = [];
  for (const course of yearCourses) {
    const quizzes = courseMap.get(course.id);
    if (quizzes && quizzes.length > 0) result.push({ course, quizzes });
  }
  return result;
}

export default function TestQuizzesPage() {
  const [coursesWithQuizzes, setCoursesWithQuizzes] = useState<CourseWithQuizzes[]>([]);
  // One course open at a time, like the quizzes dashboard: a long study list
  // reads as a few course rows instead of every quiz at once.
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sharedId, setSharedId] = useState<string | null>(null);

  /** Share a quiz with friends: native share sheet on phones, clipboard fallback. */
  const shareQuiz = async (quiz: Quiz) => {
    const url = `${window.location.origin}/quiz/${quiz.share_code}`;
    // Friends don't need accounts — the quiz link opens in guest mode.
    const shareData: ShareData = {
      title: quiz.title,
      text: `Take my quiz on OLLIN: ${quiz.title} — code ${quiz.share_code}`,
      url,
    };
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share(shareData);
        return; // shared through the native sheet (WhatsApp, etc.)
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // user cancelled
        // share failed for another reason — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (insecure context) — legacy fallback.
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setSharedId(quiz.id);
    setTimeout(() => setSharedId(null), 2000);
  };

  // Paint the cached rows first, then ask only what changed. Switching to this
  // tab therefore renders before anything touches the network.
  useEffect(() => {
    let alive = true;

    type SavedLink = { quiz_id: string; course_id: string };

    const paint = (quizzes: Quiz[], savedLinks: SavedLink[], courses: Course[]) => {
      if (!alive) return;
      setCoursesWithQuizzes(buildCourseGroups(savedLinks, courses, quizzes));
      setLoading(false);
    };

    const cachedQuizzes = getResource<Quiz[]>("quizzes")?.data;
    const cachedSaved = getResource<SavedLink[]>("saved-quizzes")?.data;
    const cachedCourses = getResource<Course[]>("courses")?.data;
    if (cachedQuizzes && cachedSaved && cachedCourses) {
      paint(cachedQuizzes, cachedSaved, cachedCourses);
    }

    (async () => {
      try {
        // Quiz rows come back as a difference against the cache; the other two
        // lists are small and shared with the layout's warm-up.
        const [quizzes, savedLinks, courses] = await Promise.all([
          loadQuizzes(),
          warmResource<SavedLink[]>("saved-quizzes", async () => {
            const res = await fetch("/api/saved-quizzes");
            const data = await res.json().catch(() => ({ saved: [] }));
            return data.saved || [];
          }),
          warmResource<Course[]>("courses", async () => {
            const res = await fetch("/api/courses");
            const data = await res.json().catch(() => ({ courses: [] }));
            return data.courses || [];
          }),
        ]);
        paint(quizzes, savedLinks, courses);
      } catch {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Save each listed quiz on this device, so the whole study list can be
  // opened, taken and marked with no connection. Guests get a 401 from the
  // bundle endpoint and simply keep the online-only behaviour.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const codes = coursesWithQuizzes
      .flatMap((c) => c.quizzes.map((q) => q.share_code))
      .filter(Boolean);
    const unique = [...new Set(codes)].slice(0, 10);

    (async () => {
      for (const quizCode of unique) {
        if (cancelled || navigator.onLine === false) return;
        await fetchAndSaveQuizBundle(quizCode);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, coursesWithQuizzes]);

  // One section per course. A search narrows the quizzes inside each section
  // instead of flattening the courses away.
  const searching = searchQuery.trim().length > 0;
  const sections = coursesWithQuizzes
    .map(({ course, quizzes }) => ({
      course,
      quizzes: searching
        ? quizzes.filter((q) => q.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : quizzes,
    }))
    .filter((s) => s.quizzes.length > 0);

  return (
    <div className="pt-2">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="greeting">Test quizzes</h1>
          <p className="greeting-sub">
            Take quizzes available in your courses.
          </p>
        </div>
        <QuizViewSwitcher />
      </div>

      {loading ? (
        <SkeletonList rows={3} rowClass="h-24" />
      ) : coursesWithQuizzes.length === 0 ? (
        <div className="app-card py-12 text-center">
          <span className="tile-icon mx-auto mb-3">
            <BookOpen className="w-5 h-5" />
          </span>
          <p className="text-sm font-bold text-[var(--ink)]">No quizzes available yet</p>
          <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xs mx-auto">
            Check back later — quizzes will appear here when published for your courses.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
            <input
              type="text"
              placeholder="Search quizzes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>

          {sections.length === 0 ? (
            <div className="app-card py-10 text-center">
              <p className="text-sm font-semibold text-[var(--ink)]">No quizzes found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map(({ course, quizzes }) => {
                const open = searching || openCourseId === course.id;
                return (
                  <div key={course.id} className="app-card overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!searching) setOpenCourseId(open ? null : course.id);
                      }}
                      aria-expanded={open}
                      className="w-full flex items-center gap-3 p-4 text-left"
                    >
                      <span className="tile-icon">
                        <BookOpen className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-[var(--ink)] truncate">
                          {course.code} — {course.name}
                        </span>
                        <span className="block text-xs text-[var(--ink-muted)]">
                          {quizzes.length} quiz{quizzes.length === 1 ? "" : "es"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-[var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>

                    {open && (
                      <div className="border-t border-[var(--border)] p-3 space-y-2">
                        {quizzes.map((quiz) => (
                          <div
                            key={quiz.id}
                            className="rounded-xl border border-[var(--border)] p-3"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="flex-1 min-w-0 text-sm font-bold text-[var(--ink)] truncate">
                                {quiz.title}
                              </p>
                              {quiz.time_limit_minutes && (
                                <span className="text-xs text-[#999] flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="w-3 h-3" /> {quiz.time_limit_minutes} min
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-xs text-[#999] font-mono whitespace-nowrap">
                                {quiz.share_code}
                              </span>
                              <span className="flex-1" />
                              <button
                                onClick={() => shareQuiz(quiz)}
                                title={`Share link: /quiz/${quiz.share_code}`}
                                className={`text-xs font-semibold px-3 py-2 rounded-[var(--radius-pill)] border flex items-center gap-1.5 flex-shrink-0 transition-colors ${
                                  sharedId === quiz.id
                                    ? "border-[#cbe8d6] bg-[#e7f5ec] text-[#116b3c]"
                                    : "border-[var(--border-strong)] text-[var(--ink-soft)] hover:border-[var(--primary)]"
                                }`}
                              >
                                {sharedId === quiz.id ? (
                                  <><Check className="w-3.5 h-3.5" /> Link copied</>
                                ) : (
                                  <><Share2 className="w-3.5 h-3.5" /> Share</>
                                )}
                              </button>
                              <Link
                                href={`/quiz/${quiz.share_code}?practice=1`}
                                className="btn-primary text-xs px-4 py-2 flex-shrink-0"
                              >
                                <Play className="w-3.5 h-3.5" /> Take quiz
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
