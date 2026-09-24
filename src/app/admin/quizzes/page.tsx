"use client";

import { useEffect, useState } from "react";
import {
  getLocalQuestions,
  saveQuizToCourse,
  removeSavedQuiz,
  isQuizSavedToCourse,
  syncSavedQuizzesFromServer,
  getLocalQuizzes,
} from "@/lib/local";
import { ChevronDown, ChevronUp, BookOpen, Clock, Save, Check, Trash2, ExternalLink, Pencil, FileText } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import { useConfirm, useToast } from "@/components/ui/toast";

export default function AdminQuizzesPage() {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [questionsMap, setQuestionsMap] = useState<Record<string, any[]>>({});
  const [error, setError] = useState("");

  const isLocal = typeof window !== "undefined" && localStorage.getItem("ollin_local_user") !== null;

  useEffect(() => {
    fetchQuizzesAndCourses();
  }, []);

  const fetchQuizzesAndCourses = async () => {
    try {
      await syncSavedQuizzesFromServer();

      // Fetch quizzes from API (server-side file)
      const res = await fetch("/api/quizzes", {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      const data = await res.json();
      const apiQuizzes = data.quizzes || [];

      // Merge with any local-only (legacy) quizzes, dedupe by id
      const merged: any[] = [...apiQuizzes];
      for (const cq of getLocalQuizzes()) {
        if (!merged.some((q) => q.id === cq.id)) {
          merged.push(cq);
        }
      }
      setQuizzes(merged);

      // Fetch courses
      const resC = await fetch("/api/courses", {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      const dataC = await resC.json();
      setCourses(dataC.courses || []);
    } catch { /* ignore */ }
  };

  // Load questions for a quiz from the server file (or local fallback)
  const loadQuestions = async (quizId: string) => {
    if (questionsMap[quizId]) return;
    let qs: any[] = [];
    try {
      const res = await fetch(`/api/quizzes/${quizId}/questions?show_answers=true`, {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      if (res.ok) {
        const data = await res.json();
        qs = data.questions || [];
      }
    } catch { /* ignore */ }
    if (qs.length === 0) qs = getLocalQuestions(quizId);
    setQuestionsMap((prev) => ({ ...prev, [quizId]: qs }));
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadQuestions(id);
    }
  };

  const handleSaveToCourse = async (quizId: string, courseId: string) => {
    await saveQuizToCourse(quizId, courseId);
    await syncSavedQuizzesFromServer();
    setQuizzes([...quizzes]);
  };

  const handleRemoveFromCourse = async (quizId: string, courseId: string) => {
    await removeSavedQuiz(quizId, courseId);
    await syncSavedQuizzesFromServer();
    setQuizzes([...quizzes]);
  };

  const handleDelete = async (quiz: any) => {
    const ok = await confirmDialog({
      title: `Delete "${quiz.title}"?`,
      body: "The quiz and all its questions will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete quiz",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}`, {
        method: "DELETE",
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to delete quiz");
        return;
      }
      // Remove from local cache too
      const remaining = getLocalQuizzes().filter((q) => q.id !== quiz.id);
      localStorage.setItem("ollin_local_quizzes", JSON.stringify(remaining));
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
      toast.success(`"${quiz.title}" deleted`);
      if (expandedId === quiz.id) setExpandedId(null);
      // Remove from saved-to-course associations
      const { getSavedQuizzes } = await import("@/lib/local");
      const saved = getSavedQuizzes().filter((s) => s.quiz_id !== quiz.id);
      localStorage.setItem("ollin_local_saved_quizzes", JSON.stringify(saved));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete quiz");
    }
  };

  return (
    <div>
      <PageBanner
        title="Quizzes"
        subtitle={`${quizzes.length} quiz${quizzes.length !== 1 ? "zes" : ""} total`}
        icon={<FileText className="w-5 h-5" />}
      />

      {error && (
        <div className="mb-4 text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded">{error}</div>
      )}

      {quizzes.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <BookOpen className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">No quizzes have been created yet.</p>
          <p className="text-xs text-[#999] mt-1">Quizzes will appear here once students create them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quizzes.map((quiz: any) => {
            const questions = questionsMap[quiz.id] || [];
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
                        <BookOpen className="w-3 h-3" />{" "}
                        {questions.length > 0 ? `${questions.length} questions` : "…"}
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
                    <span className="text-xs text-[#999] hidden sm:inline">
                      {new Date(quiz.created_at).toLocaleDateString()}
                    </span>
                    <a
                      href={`/quiz/${quiz.share_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded hover:bg-blue-50 text-[#999] hover:text-blue-600 transition-colors"
                      title="Open quiz"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`/dashboard/create?edit=${quiz.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded hover:bg-green-50 text-[#999] hover:text-green-600 transition-colors"
                      title="Edit quiz"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(quiz); }}
                      className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors"
                      title="Delete quiz"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#999]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#999]" />
                    )}
                  </div>
                </div>

                {/* Expanded: save-to-course + questions */}
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
                                  {q.options && Array.isArray(q.options) && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {q.options.map((opt: string, oi: number) => {
                                        const isCorrect =
                                          q.question_type === "true_false"
                                            ? String(q.correct_answer).toLowerCase() ===
                                              String(opt).toLowerCase()
                                            : String(oi) === String(q.correct_answer);
                                        return (
                                          <p key={oi} className={`text-[11px] ${isCorrect ? "text-green-600 font-medium" : "text-[#666]"}`}>
                                            {String.fromCharCode(65 + oi)}. {opt}
                                            {isCorrect && " ✓"}
                                          </p>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {(q.question_type === "short_answer" || q.question_type === "fill_blank") && q.correct_answer && (
                                    <p className="text-[11px] text-green-600 font-medium mt-1">
                                      Answer: {q.correct_answer}
                                    </p>
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
