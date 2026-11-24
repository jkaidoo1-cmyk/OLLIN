"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle, History } from "lucide-react";
import { SkeletonPanel } from "@/components/Skeleton";
import { QuizViewSwitcher } from "@/components/QuizViewSwitcher";
import { useResource } from "@/lib/prefetch";
import { loadQuizzes } from "@/lib/quizzes-sync";
import { Quiz } from "@/lib/types";
import { useOffline } from "@/lib/use-offline";

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

// Mirror of the server's grading comparison (submit route): case- and
// whitespace-insensitive, so review badges always agree with the official
// score even when answers were stored with stray formatting.
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Shared with the dashboard layout's warm-up and the quiz pages. */
const quizzesResourceKey = "quizzes";

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600 bg-green-50";
  if (score >= 50) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

const attemptsFetcher = async (): Promise<MyAttempt[]> => {
  try {
    const res = await fetch("/api/attempts?mine=true");
    if (!res.ok) throw new Error("Please log in to see your attempts.");
    const data = await res.json();
    const rows: MyAttempt[] = data.attempts || [];

    // Attach quiz titles from the list the layout already warmed — one shared
    // cached list, delta refreshed, instead of a second full download.
    try {
      const allQuizzes = await loadQuizzes();
      const titles = new Map<string, string>(allQuizzes.map((q) => [q.id, q.title]));
      for (const a of rows) a.quiz_title = titles.get(a.quiz_id) || "Untitled quiz";
    } catch { /* titles optional */ }

    rows.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
    return rows;
  } catch {
    return [];
  }
};

export default function MyAttemptsPage() {
  // Reads the resource warmed on layout mount — usually already resolved.
  const { data: warmed, loading: warmLoading } = useResource("my-attempts", attemptsFetcher);
  const [attempts, setAttempts] = useState<MyAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<Record<string, ReviewQuestion[]>>({});
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<Record<string, string>>({});
  const offline = useOffline();

  // Titles come from the quiz list the layout warms, so an attempt never shows
  // "Untitled quiz" just because the attempts resource was warmed first.
  const { data: allQuizzes } = useResource<Quiz[]>(quizzesResourceKey, async () => loadQuizzes());
  const quizTitles = useMemo(
    () => new Map((allQuizzes || []).map((q) => [q.id, q.title])),
    [allQuizzes]
  );

  useEffect(() => {
    if (warmLoading) return;
    setAttempts(warmed || []);
    setLoading(false);
  }, [warmed, warmLoading]);

  const loadReview = async (attempt: MyAttempt) => {
    if (reviewData[attempt.id] || !attempt.answers) return;
    setReviewLoading(attempt.id);
    setReviewError((prev) => ({ ...prev, [attempt.id]: "" }));
    try {
      // Owner-scoped endpoint returns questions WITH correct answers
      const res = await fetch(`/api/attempts/${attempt.id}/review`);
      const data = await res.json();
      setReviewData((prev) => ({ ...prev, [attempt.id]: data.questions || [] }));
    } catch {
      // Offline and this review was never cached: say why instead of claiming
      // the quiz's questions are gone. Reopening the attempt retries.
      setReviewError((prev) => ({
        ...prev,
        [attempt.id]:
          navigator.onLine === false
            ? "You're offline and this review wasn't saved on this device. Open it once while connected and it will be available offline."
            : "We couldn't load this review. Check your connection and try again.",
      }));
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
    <div className="pt-2">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="greeting">My attempts</h1>
          <p className="greeting-sub">
            Every quiz you have taken, with question-by-question review.
          </p>
        </div>
        <QuizViewSwitcher />
      </div>

      {loading ? (
        <SkeletonPanel rows={4} />
      ) : attempts.length === 0 ? (
        <div className="app-card py-12 text-center">
          <span className="tile-icon mx-auto mb-3">
            <History className="w-5 h-5" />
          </span>
          <p className="text-sm font-bold text-[var(--ink)]">
            {offline ? "No attempts saved offline" : "No attempts yet"}
          </p>
          <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xs mx-auto">
            {offline
              ? "Open this page once while connected and your attempts will stay available here."
              : "Quizzes you take — from Test quizzes or a shared link — will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {attempts.map((a) => {
            const isOpen = expanded === a.id;
            const questions = reviewData[a.id];
            return (
              <div key={a.id} className="list-card">
                <button
                  onClick={() => toggle(a)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-[#f7fbf8] transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-[#999] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#999] flex-shrink-0" />
                  )}
                  <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 font-bold ${scoreColor(a.score_percentage)}`}>
                    <span className="text-sm">{a.score_percentage}%</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#333] truncate">
                      {a.quiz_title || quizTitles.get(a.quiz_id) || "Untitled quiz"}
                      {a.status === "timed_out" && (
                        <span className="ml-2 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded align-middle">Timed out — not submitted</span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[#999]">
                      {/* Older rows can carry a zero total; a bare count reads
                          better than "29/0". */}
                      <span>
                        {a.total_questions
                          ? `${a.correct_answers}/${a.total_questions} correct`
                          : `${a.correct_answers} correct`}
                      </span>
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
                        Answer details weren&apos;t recorded for this attempt.
                      </p>
                    ) : reviewLoading === a.id ? (
                      <p className="text-xs text-[#999] py-3">Loading review…</p>
                    ) : reviewError[a.id] ? (
                      <p className="text-xs text-[#999] py-3">{reviewError[a.id]}</p>
                    ) : !questions || questions.length === 0 ? (
                      <p className="text-xs text-[#999] py-3">
                        The questions for this quiz are no longer available.
                      </p>
                    ) : (
                      <div className="space-y-3 pt-2">
                        {questions.map((q, idx) => {
                          const selected = a.answers?.[q.id] || null;
                          const isCorrect = !!selected && norm(selected) === norm(q.correct_answer);
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
                                    Your answer: {norm(selected) === "true" || norm(selected) === "false" ? (norm(selected) === "true" ? "True" : "False") : selected}
                                  </span>
                                  {!isCorrect && (
                                    <span className="text-green-700">
                                      · Correct: {norm(q.correct_answer) === "true" ? "True" : norm(q.correct_answer) === "false" ? "False" : q.correct_answer}
                                    </span>
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
