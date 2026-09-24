"use client";

import { useEffect, useState } from "react";
import { Award, ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle, History } from "lucide-react";
import PageBanner from "@/components/PageBanner";

interface MyAttempt {
  id: string;
  quiz_id: string;
  quiz_title?: string;
  score_percentage: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number | null;
  completed_at: string;
  answers: Record<string, string> | null;
  status?: string;
}

interface ReviewQuestion {
  id: string;
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600 bg-green-50";
  if (score >= 50) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

export default function MyAttemptsPage() {
  const [attempts, setAttempts] = useState<MyAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<Record<string, ReviewQuestion[]>>({});
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/attempts?mine=true");
        if (!res.ok) throw new Error("Please log in to see your attempts.");
        const data = await res.json();
        const rows: MyAttempt[] = data.attempts || [];

        // Attach quiz titles in one call
        try {
          const qRes = await fetch("/api/quizzes");
          const qData = await qRes.json();
          const titles = new Map<string, string>(
            (qData.quizzes || []).map((q: { id: string; title: string }) => [q.id, q.title])
          );
          for (const a of rows) a.quiz_title = titles.get(a.quiz_id) || "Untitled quiz";
        } catch { /* titles optional */ }

        rows.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
        setAttempts(rows);
      } catch {
        setAttempts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadReview = async (attempt: MyAttempt) => {
    if (reviewData[attempt.id] || !attempt.answers) return;
    setReviewLoading(attempt.id);
    try {
      // Owner-scoped endpoint returns questions WITH correct answers
      const res = await fetch(`/api/attempts/${attempt.id}/review`);
      const data = await res.json();
      setReviewData((prev) => ({ ...prev, [attempt.id]: data.questions || [] }));
    } catch {
      setReviewData((prev) => ({ ...prev, [attempt.id]: [] }));
    } finally {
      setReviewLoading(null);
    }
  };

  const toggle = (attempt: MyAttempt) => {
    if (expanded === attempt.id) {
      setExpanded(null);
      return;
    }
    setExpanded(attempt.id);
    loadReview(attempt);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageBanner
        title="My attempts"
        subtitle="Every quiz you have taken, with question-by-question review"
        icon={<History className="w-5 h-5" />}
      />

      {loading ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <History className="w-8 h-8 text-[#ccc] mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-[#666]">Loading…</p>
        </div>
      ) : attempts.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <History className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">No attempts yet.</p>
          <p className="text-xs text-[#999] mt-1">
            Quizzes you take — from Test quizzes or a shared link — will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {attempts.map((a) => {
            const isOpen = expanded === a.id;
            const questions = reviewData[a.id];
            return (
              <div key={a.id} className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(a)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#fafafa] transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-[#999] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#999] flex-shrink-0" />
                  )}
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${scoreColor(a.score_percentage)}`}>
                    <span className="text-sm font-bold">{a.score_percentage}%</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#333] truncate">
                      {a.quiz_title || "Untitled quiz"}
                      {a.status === "timed_out" && (
                        <span className="ml-2 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded align-middle">Timed out — not submitted</span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[#999]">
                      <span>{a.correct_answers}/{a.total_questions} correct</span>
                      {a.time_taken_seconds != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {a.time_taken_seconds >= 60
                            ? `${Math.floor(a.time_taken_seconds / 60)}m ${a.time_taken_seconds % 60}s`
                            : `${a.time_taken_seconds}s`}
                        </span>
                      )}
                      <span>{new Date(a.completed_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {a.answers && (
                    <span className="text-[10px] text-[#006633] bg-green-50 px-2 py-1 rounded flex-shrink-0">
                      Review
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#f0f0f0]">
                    {!a.answers ? (
                      <p className="text-xs text-[#999] py-3">
                        Answer details weren't recorded for this attempt.
                      </p>
                    ) : reviewLoading === a.id ? (
                      <p className="text-xs text-[#999] py-3">Loading review…</p>
                    ) : !questions || questions.length === 0 ? (
                      <p className="text-xs text-[#999] py-3">
                        The questions for this quiz are no longer available.
                      </p>
                    ) : (
                      <div className="space-y-3 pt-2">
                        {questions.map((q, idx) => {
                          const selected = a.answers?.[q.id] || null;
                          const isCorrect = selected === q.correct_answer;
                          const optionLetter = (i: number) => String.fromCharCode(65 + i);
                          return (
                            <div key={q.id} className="border border-[#e0e0e0] rounded-lg p-3">
                              <div className="flex items-start gap-2">
                                {isCorrect ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                )}
                                <p className="text-sm text-[#333] flex-1">
                                  <span className="font-medium">{idx + 1}.</span> {q.question}
                                </p>
                              </div>
                              {q.options && (
                                <div className="mt-2 space-y-1 pl-6">
                                  {q.options.map((opt, i) => {
                                    const isThis = selected === String(i);
                                    const isAns = q.correct_answer === String(i);
                                    return (
                                      <p
                                        key={i}
                                        className={`text-xs ${
                                          isAns
                                            ? "text-green-700 font-medium"
                                            : isThis
                                            ? "text-red-600"
                                            : "text-[#666]"
                                        }`}
                                      >
                                        {optionLetter(i)}. {opt}
                                        {isAns && " ✓"}
                                        {isThis && !isAns && " (your answer)"}
                                      </p>
                                    );
                                  })}
                                </div>
                              )}
                              {!q.options && selected && (
                                <p className="text-xs pl-6 mt-1">
                                  <span className={isCorrect ? "text-green-700" : "text-red-600"}>
                                    Your answer: {selected}
                                  </span>
                                  {!isCorrect && (
                                    <span className="text-green-700"> · Correct: {q.correct_answer}</span>
                                  )}
                                </p>
                              )}
                              {q.explanation && (
                                <p className="text-xs text-[#666] mt-2 pl-6 flex items-start gap-1">
                                  <Award className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#006633]" />
                                  {q.explanation}
                                </p>
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
          })}
        </div>
      )}
    </div>
  );
}
