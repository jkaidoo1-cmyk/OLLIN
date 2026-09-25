"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLocalUser } from "@/lib/local";
import { Quiz, Course } from "@/lib/types";
import { SkeletonList } from "@/components/Skeleton";
import { warmResource } from "@/lib/prefetch";
import { BookOpen, Clock, Play, Search, Share2, Check } from "lucide-react";

interface CourseWithQuizzes {
  course: Course;
  quizzes: Quiz[];
}

/**
 * Test quizzes — admin-saved quizzes for the student's courses, plus the
 * built-in OLLIN Test Quiz (TST-101) that exists on every deployment so
 * anyone can try the platform from any device.
 * All data is read from the server APIs (single source of truth):
 *   - /api/saved-quizzes  → quiz ↔ course links saved by the admin
 *   - /api/courses        → courses, filtered by the student's year
 *   - /api/quizzes        → quiz metadata (title, code, time limit)
 */

/** The built-in platform test quiz — always offered, independent of courses. */
const BUILT_IN_TEST_QUIZ: Quiz & { built_in: true } = {
  id: "quiz-test-tst101",
  host_id: "system",
  title: "OLLIN Test Quiz",
  description: "Try the platform — 5 quick questions.",
  share_code: "TST-101",
  time_limit_minutes: 15,
  max_attempts: 1,
  show_answers_after: "after_completion",
  shuffle_questions: false,
  shuffle_options: false,
  passing_score: 50,
  starts_at: null,
  ends_at: null,
  status: "published",
  course_id: null,
  material_id: null,
  created_at: "2026-09-24T17:00:00.000Z",
  updated_at: "2026-09-24T17:00:00.000Z",
  built_in: true,
};
export default function TestQuizzesPage() {
  const [coursesWithQuizzes, setCoursesWithQuizzes] = useState<CourseWithQuizzes[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
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

  useEffect(() => {
    const load = async () => {
      try {
        // These three resources are warmed on layout mount; Promise.all via
        // warmResource shares those in-flight promises instead of refetching.
        const [savedData, coursesData, quizzesData] = await Promise.all([
          warmResource("saved-quizzes", async () => {
            const res = await fetch("/api/saved-quizzes");
            return res.json().catch(() => ({ saved: [] }));
          }),
          warmResource("courses", async () => {
            const res = await fetch("/api/courses");
            return res.json().catch(() => ({ courses: [] }));
          }),
          warmResource("quizzes", async () => {
            const res = await fetch("/api/quizzes");
            return res.json().catch(() => ({ quizzes: [] }));
          }),
        ]);
        const savedLinks: Array<{ quiz_id: string; course_id: string }> = savedData.saved || [];
        const allCourses: Course[] = coursesData.courses || [];
        const allQuizzes: Quiz[] = quizzesData.quizzes || [];

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
          if (quizzes && quizzes.length > 0) {
            result.push({ course, quizzes });
          }
        }

        setCoursesWithQuizzes(result);
        if (result.length === 1) {
          setSelectedCourseId(result[0].course.id);
        }
      } catch {
        setCoursesWithQuizzes([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // The built-in test quiz appears unless a search excludes it (a course filter hides it automatically).
  const showBuiltIn =
    !selectedCourseId &&
    "ollin test quiz".includes(searchQuery.trim().toLowerCase());
  const builtInFirst: CourseWithQuizzes[] = [
    ...(showBuiltIn
      ? [
          {
            course: {
              id: "built-in",
              code: "TEST",
              name: "Platform test quiz",
              description: null,
              program_id: null,
              year: null,
              created_at: BUILT_IN_TEST_QUIZ.created_at,
              updated_at: BUILT_IN_TEST_QUIZ.updated_at,
            } as Course,
            quizzes: [BUILT_IN_TEST_QUIZ],
          },
        ]
      : []),
    ...coursesWithQuizzes,
  ];

  const filteredQuizzes = builtInFirst
    .filter((c) => (selectedCourseId ? c.course.id === selectedCourseId : true))
    .flatMap((c) => c.quizzes)
    .filter((q) =>
      q.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#333]">Test Quizzes</h1>
        <p className="text-xs text-[#999] mt-0.5">
          Take quizzes available in your courses
        </p>
      </div>

      {loading ? (
        <SkeletonList rows={3} rowClass="h-24" />
      ) : builtInFirst.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <BookOpen className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">No quizzes available yet</p>
          <p className="text-xs text-[#999] mt-1">
            Check back later — quizzes will appear here when published for your courses.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Course filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCourseId(null)}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCourseId === null
                  ? "bg-green-600 text-white"
                  : "bg-white border border-[#e0e0e0] text-[#666] hover:border-green-400"
              }`}
            >
              All courses
            </button>
            {builtInFirst.map(({ course, quizzes }) => (
              <button
                key={course.id}
                onClick={() => setSelectedCourseId(course.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCourseId === course.id
                    ? "bg-green-600 text-white"
                    : "bg-white border border-[#e0e0e0] text-[#666] hover:border-green-400"
                }`}
              >
                {course.code} ({quizzes.length})
              </button>
            ))}
          </div>

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

          {/* Quiz list */}
          <div className="space-y-2">
            {filteredQuizzes.length === 0 ? (
              <div className="bg-white border border-[#e0e0e0] rounded-lg p-8 text-center">
                <p className="text-sm text-[#666]">No quizzes found</p>
              </div>
            ) : (
              filteredQuizzes.map((quiz) => {
                const course = coursesWithQuizzes.find((c) =>
                  c.quizzes.some((q) => q.id === quiz.id)
                )?.course;

                return (
                  <div
                    key={quiz.id}
                    className="bg-white border border-[#e0e0e0] rounded-lg p-4 flex flex-wrap items-center gap-3 sm:gap-4 hover:border-green-300 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm font-medium text-[#333] truncate">
                        {quiz.title}
                      </p>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {course && (
                          <span className="text-xs text-[#999]">
                            {course.code}
                          </span>
                        )}
                        <span className="text-xs text-[#999] font-mono whitespace-nowrap">
                          {quiz.share_code}
                        </span>
                        {quiz.time_limit_minutes && (
                          <span className="text-xs text-[#999] flex items-center gap-1 whitespace-nowrap">
                            <Clock className="w-3 h-3" /> {quiz.time_limit_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => shareQuiz(quiz)}
                      title={`Share link: /quiz/${quiz.share_code}`}
                      className={`px-3 py-2 border text-xs font-medium rounded transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                        sharedId === quiz.id
                          ? "border-green-300 bg-green-50 text-green-700"
                          : "border-[#e0e0e0] text-[#333] hover:border-green-400"
                      }`}
                    >
                      {sharedId === quiz.id ? (
                        <><Check className="w-3.5 h-3.5" /> Link copied</>
                      ) : (
                        <><Share2 className="w-3.5 h-3.5" /> Share</>
                      )}
                    </button>
                    <Link
                      href={`/quiz/${quiz.share_code}`}
                      className="px-4 py-2 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" /> Take quiz
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
