"use client";

import { useEffect, useState } from "react";
import { getDemoQuestions, getDemoCourses, saveQuizToCourse, removeSavedQuiz, isQuizSavedToCourse } from "@/lib/demo";
import { ChevronDown, ChevronUp, BookOpen, Clock, Save, Check } from "lucide-react";

export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [saveTarget, setSaveTarget] = useState<{ quizId: string; courseId: string } | null>(null);

  const isDemo = typeof window !== "undefined" && localStorage.getItem("ollin_demo_user") !== null;

  useEffect(() => {
    fetchQuizzesAndCourses();
  }, []);

  const fetchQuizzesAndCourses = async () => {
    try {
      // Fetch quizzes from API (server-side file)
      const res = await fetch("/api/quizzes", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const data = await res.json();
      const apiQuizzes = data.quizzes || [];

      // Also get client-side quizzes from localStorage
      let clientQuizzes: any[] = [];
      try {
        const stored = localStorage.getItem("ollin_demo_quizzes");
        clientQuizzes = stored ? JSON.parse(stored) : [];
      } catch { /* ignore */ }

      // Merge: deduplicate by id
      const merged: any[] = [...apiQuizzes];
      for (const cq of clientQuizzes) {
        if (!merged.some((q) => q.id === cq.id)) {
          merged.push(cq);
        }
      }
      setQuizzes(merged);

      // Fetch courses from API (server-side file)
      const resC = await fetch("/api/courses", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const dataC = await resC.json();
      const apiCourses = dataC.courses || [];

      // Also get client-side courses from localStorage
      let clientCourses: any[] = [];
      try {
        const stored = localStorage.getItem("ollin_demo_courses");
        clientCourses = stored ? JSON.parse(stored) : [];
      } catch { /* ignore */ }

      const mergedCourses: any[] = [...apiCourses];
      for (const cc of clientCourses) {
        if (!mergedCourses.some((c) => c.id === cc.id)) {
          mergedCourses.push(cc);
        }
      }
      setCourses(mergedCourses);
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSaveToCourse = (quizId: string, courseId: string) => {
    saveQuizToCourse(quizId, courseId);
    setSaveTarget(null);
    // Re-render
    setQuizzes([...quizzes]);
  };

  const handleRemoveFromCourse = (quizId: string, courseId: string) => {
    removeSavedQuiz(quizId, courseId);
    setQuizzes([...quizzes]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#333]">Quizzes</h1>
          <p className="text-xs text-[#999] mt-0.5">{quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""} total</p>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <BookOpen className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">No quizzes have been created yet.</p>
          <p className="text-xs text-[#999] mt-1">Quizzes will appear here once students create them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quizzes.map((quiz: any) => {
            const questions = getDemoQuestions(quiz.id);
            const isExpanded = expandedId === quiz.id;

            return (
              <div key={quiz.id} className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-[#f8f8f8] transition-colors"
                  onClick={() => toggleExpand(quiz.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#333] truncate">{quiz.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[#999] font-mono">{quiz.share_code}</span>
                      <span className="text-xs text-[#999] flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> {questions.length} questions
                      </span>
                      {quiz.time_limit_minutes && (
                        <span className="text-xs text-[#999] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {quiz.time_limit_minutes}m
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`badge ${quiz.status === "published" ? "badge-success" : quiz.status === "draft" ? "badge-warning" : "badge-slate"}`}>
                      {quiz.status}
                    </span>
                    <span className="text-xs text-[#999]">
                      {new Date(quiz.created_at).toLocaleDateString()}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#999]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#999]" />
                    )}
                  </div>
                </div>

                {/* Expanded questions list */}
                {isExpanded && (
                  <div className="border-t border-[#e0e0e0] bg-[#f8f8f8] p-4">
                    {/* Save to course section */}
                    <div className="mb-4 p-3 bg-white border border-[#e0e0e0] rounded">
                      <p className="text-xs font-semibold text-[#666] mb-2">Save to course</p>
                      <p className="text-[10px] text-[#999] mb-2">
                        Select a course to make this quiz available for students to take.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {courses.map((course: any) => {
                          const saved = isQuizSavedToCourse(quiz.id, course.id);
                          return (
                            <div key={course.id} className="flex items-center gap-1">
                              {saved ? (
                                <button
                                  onClick={() => handleRemoveFromCourse(quiz.id, course.id)}
                                  className="px-2.5 py-1 text-[10px] font-medium rounded bg-green-50 text-green-700 border border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center gap-1"
                                  title={`Remove from ${course.code}`}
                                >
                                  <Check className="w-3 h-3" /> {course.code}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSaveToCourse(quiz.id, course.id)}
                                  className="px-2.5 py-1 text-[10px] font-medium rounded bg-white text-[#666] border border-[#e0e0e0] hover:border-green-400 hover:text-green-600 transition-colors flex items-center gap-1"
                                >
                                  <Save className="w-3 h-3" /> {course.code}
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {courses.length === 0 && (
                          <p className="text-[10px] text-[#999]">No courses available. Add courses first.</p>
                        )}
                      </div>
                    </div>

                    {/* Questions */}
                    {questions.length > 0 ? (
                      <>
                        <p className="text-xs font-semibold text-[#666] mb-3">Questions</p>
                        <div className="space-y-2">
                          {questions.map((q: any, idx: number) => (
                            <div key={q.id} className="bg-white border border-[#e0e0e0] rounded p-3">
                              <div className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-[#333]">{q.question_text}</p>
                                  {q.options && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {q.options.map((opt: string, oi: number) => {
                                        const isCorrect = String(oi) === q.correct_answer;
                                        return (
                                          <p key={oi} className={`text-[11px] ${isCorrect ? "text-green-600 font-medium" : "text-[#666]"}`}>
                                            {String.fromCharCode(65 + oi)}. {opt}
                                            {isCorrect && " ✓"}
                                          </p>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {q.explanation && (
                                    <p className="text-[10px] text-[#999] mt-1.5 bg-[#f0f0f0] rounded px-2 py-1">
                                      {q.explanation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-[#999] text-center">No questions found for this quiz.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
