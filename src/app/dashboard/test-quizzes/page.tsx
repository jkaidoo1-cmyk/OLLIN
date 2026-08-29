"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getDemoCourses,
  getSavedQuizzesForStudent,
  getDemoQuizzes,
  getDemoUser,
} from "@/lib/demo";
import { Quiz, Course } from "@/lib/types";
import { BookOpen, Clock, Play, ChevronRight, Search } from "lucide-react";

interface CourseWithQuizzes {
  course: Course;
  quizzes: Quiz[];
}

export default function TestQuizzesPage() {
  const [coursesWithQuizzes, setCoursesWithQuizzes] = useState<CourseWithQuizzes[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const savedQuizzes = getSavedQuizzesForStudent();
    let allCourses = getDemoCourses();
    const user = getDemoUser();

    // Filter courses by student's current year
    const studentYear = user?.current_year;
    if (studentYear) {
      allCourses = allCourses.filter((c) => !c.year || c.year === studentYear);
    }

    // Group quizzes by course
    const courseMap = new Map<string, Quiz[]>();
    for (const quiz of savedQuizzes) {
      const courseId = quiz.course_id;
      if (!courseId) continue;
      if (!courseMap.has(courseId)) courseMap.set(courseId, []);
      courseMap.get(courseId)!.push(quiz);
    }

    // Build list with courses that have saved quizzes
    const result: CourseWithQuizzes[] = [];
    for (const course of allCourses) {
      const quizzes = courseMap.get(course.id);
      if (quizzes && quizzes.length > 0) {
        result.push({ course, quizzes });
      }
    }

    setCoursesWithQuizzes(result);

    // Auto-select first course if only one
    if (result.length === 1) {
      setSelectedCourseId(result[0].course.id);
    }
  }, []);

  const filteredQuizzes = coursesWithQuizzes
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

      {coursesWithQuizzes.length === 0 ? (
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
            {coursesWithQuizzes.map(({ course, quizzes }) => (
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
                    className="bg-white border border-[#e0e0e0] rounded-lg p-4 flex items-center gap-4 hover:border-green-300 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#333] truncate">
                        {quiz.title}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {course && (
                          <span className="text-xs text-[#999]">
                            {course.code}
                          </span>
                        )}
                        <span className="text-xs text-[#999] font-mono">
                          {quiz.share_code}
                        </span>
                        {quiz.time_limit_minutes && (
                          <span className="text-xs text-[#999] flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {quiz.time_limit_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
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
