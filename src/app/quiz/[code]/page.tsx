"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalQuizByCode, getLocalQuestions, getLocalUser } from "@/lib/local";
import { Quiz, Question, QuizAttempt } from "@/lib/types";
import { Clock, Send, CheckCircle, AlertCircle, User } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatTime } from "@/lib/utils";

export default function QuizPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const guestName = searchParams.get("guest");
  const router = useRouter();
  const supabase = createClient();

  const isGuest = !!guestName;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [joined, setJoined] = useState(false);
  const [participantName, setParticipantName] = useState(guestName || "");
  const [currentUser, setCurrentUser] = useState<{ name: string; email?: string | null; isGuest: boolean } | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);


  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [results, setResults] = useState<{
    score: number;
    total: number;
    correct: number;
    detailed: Array<{ question: Question; selected: string | null; isCorrect: boolean }>;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoJoiningRef = useRef(false);

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      if (guestName) {
        setCurrentUser({ name: guestName, isGuest: true });
        return;
      }
      if (isLocalMode()) {
        const localUser = getLocalUser();
        if (localUser) {
          setCurrentUser({ name: localUser.full_name, isGuest: false });
          setParticipantName(localUser.full_name);
        }
        return;
      }
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const name = data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Student";
          setCurrentUser({ name, isGuest: false });
          setParticipantName(name);
        }
      }
    };
    checkUser();
  }, [guestName, supabase]);

  useEffect(() => {
    const fetchQuiz = async () => {
      // Always try the public API first (works for guests, local, and logged-in users)
      try {
        const res = await fetch(`/api/quizzes/${code}`);
        if (res.ok) {
          const data = await res.json();
          if (data.quiz && data.quiz.status !== "draft") {
            setQuiz(data.quiz);
            setQuestions(data.questions || []);
            setLoading(false);
            return;
          } else if (data.quiz) {
            setError("This quiz is not published yet.");
            setLoading(false);
            return;
          }
        }
      } catch { /* fall through to other methods */ }

      // Try local mode localStorage
      if (isLocalMode()) {
        const localQuiz = getLocalQuizByCode(code);
        if (localQuiz && localQuiz.status !== "draft") {
          setQuiz(localQuiz);
          setQuestions(getLocalQuestions(localQuiz.id));
        } else if (localQuiz) {
          setError("This quiz is not published yet.");
        } else {
          setError("Quiz not found. Check the code and try again.");
        }
        setLoading(false);
        return;
      }

      // Try Supabase
      if (supabase) {
        const { data, error: fetchError } = await supabase
          .from("quizzes").select("*").eq("share_code", code).single();

        if (!fetchError && data) {
          if (data.status === "draft") {
            setError("This quiz is not published yet.");
            setLoading(false);
            return;
          }
          setQuiz(data);
          const { data: qData } = await supabase
            .from("questions").select("*").eq("quiz_id", data.id).order("order_index");
          if (qData) setQuestions(qData);
          setLoading(false);
          return;
        }
      }

      setError("Quiz not found. Check the code and try again.");
      setLoading(false);
    };
    fetchQuiz();
  }, [code, supabase]);

  useEffect(() => {
    if (joined && quiz?.time_limit_minutes && timeLeft === null) {
      setTimeLeft(quiz.time_limit_minutes * 60);
    }
  }, [joined, quiz, timeLeft]);

  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0 && !submitted) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    if (timeLeft === 0 && !submitted) handleSubmit();
  }, [timeLeft, submitted]);

  useEffect(() => {
    if (joined && quiz) {
      const key = `quiz_${quiz.id}_answers`;
      localStorage.setItem(key, JSON.stringify(answers));
    }
  }, [answers, joined, quiz]);

  useEffect(() => {
    if (joined && quiz) {
      const key = `quiz_${quiz.id}_answers`;
      const saved = localStorage.getItem(key);
      if (saved) { try { setAnswers(JSON.parse(saved)); } catch {} }
    }
  }, [joined, quiz]);

  const handleJoin = async () => {
    if (!participantName.trim()) return;

    if (isGuest || isLocalMode()) {
      setJoined(true);
      return;
    }

    if (supabase) {
      const { data, error } = await supabase.from("quiz_attempts").insert({
        quiz_id: quiz!.id,
        participant_name: participantName.trim(),
        total_questions: questions.length,
        status: "in_progress",
      }).select().single();

      if (!error) {
        setAttempt(data);
      }
    }
    setJoined(true);
  };

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted || !quiz || !questions.length) return;
    setSubmitting(true);
    if (timerRef.current) clearTimeout(timerRef.current);

    // ── Server-side grading ────────────────────────────────
    // Correct answers never reach the browser, so the server computes the
    // score. The client only renders what the server returns — participants
    // can't grade their own submission or fake their score.
    const attemptId = attempt?.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timeTaken = quiz.time_limit_minutes
      ? quiz.time_limit_minutes * 60 - (timeLeft || 0)
      : null;

    let score = 0;
    let correct = 0;
    let detailed: Array<{ question: any; selected: string | null; isCorrect: boolean }> = [];

    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isLocalMode() ? { "x-local-mode": "true" } : {}) },
        body: JSON.stringify({
          quiz_id: quiz.id,
          participant_name: participantName || "Anonymous",
          participant_email: currentUser?.email || null,
          time_taken_seconds: timeTaken,
          answers: questions.map((q) => ({
            question_id: q.id,
            selected_answer: answers[q.id] || "",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit quiz");

      score = data.attempt?.score_percentage ?? 0;
      correct = data.attempt?.correct_answers ?? 0;

      // Build the review from server-graded answers + answer key fetched
      // AFTER grading (the graded response includes the correct answers).
      const gradedMap: Record<string, { is_correct: boolean; selected_answer: string }> = {};
      for (const a of data.answers || []) {
        gradedMap[a.question_id] = { is_correct: a.is_correct, selected_answer: a.selected_answer };
      }
      // The submit response may include the answer key for review; if not,
      // fetch it from the graded endpoint.
      let keyByQ: Record<string, string> = {};
      if (data.answer_key) {
        keyByQ = data.answer_key;
      } else {
        try {
          const kRes = await fetch(`/api/attempts/${attemptId}/review`, {
            headers: isLocalMode() ? { "x-local-mode": "true" } : {},
          });
          if (kRes.ok) {
            const kData = await kRes.json();
            for (const item of kData.review || []) {
              keyByQ[item.question_id] = item.correct_answer;
            }
          }
        } catch { /* review optional */ }
      }

      detailed = questions.map((q) => ({
        question: { ...q, correct_answer: keyByQ[q.id] ?? "", explanation: (data.explanations || {})[q.id] ?? null },
        selected: gradedMap[q.id]?.selected_answer || answers[q.id] || null,
        isCorrect: !!gradedMap[q.id]?.is_correct,
      }));
    } catch {
      // Grading failed (network/server). Block the submission rather than
      // grade client-side — silently accepting a fakeable score is worse
      // than a retry.
      alert("Could not submit your quiz. Please check your connection and try again.");
      setSubmitting(false);
      return;
    }

    // Mirror the graded result into localStorage for local mode (My Attempts)
    if (isLocalMode()) {
      const { saveLocalAttempt } = await import("@/lib/local");
      const localUser = getLocalUser();
      saveLocalAttempt({
        id: attemptId,
        quiz_id: quiz.id,
        participant_email: localUser?.email || currentUser?.email || null,
        participant_name: participantName || "Anonymous",
        score_percentage: score,
        correct_answers: correct,
        total_questions: questions.length,
        time_taken_seconds: timeTaken,
        answers,
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      // Results surface on the creator's dashboard charts — no notification here.
    }

    localStorage.removeItem(`quiz_${quiz.id}_answers`);

    setResults({ score, total: questions.length, correct, detailed });
    setSubmitted(true);
    setSubmitting(false);

    // Fetch the participant's standing on this quiz (best-effort)
    try {
      const lbRes = await fetch(`/api/quizzes/${quiz.id}/leaderboard`);
      if (lbRes.ok) {
        const lb = await lbRes.json();
        if (lb.your_rank != null) {
          setRank({ rank: lb.your_rank, total: lb.total_attempts });
        }
      }
    } catch { /* leaderboard optional */ }
  }, [submitting, submitted, quiz, questions, answers, attempt, timeLeft, isGuest, participantName, supabase, currentUser]);

  // Auto-join for logged-in users and guests with URL name (MUST be before conditional returns)
  const shouldAutoJoin = (currentUser && !currentUser.isGuest) || (isGuest && !!guestName);

  useEffect(() => {
    if (shouldAutoJoin && !joined && !loading && quiz && !autoJoiningRef.current) {
      autoJoiningRef.current = true;
      handleJoin();
    }
  }, [shouldAutoJoin, joined, loading, quiz]);

  // ─── Conditional renders (ALL hooks declared above) ───

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-[#006633] text-white h-14 flex items-center px-6">
          <Logo onDark />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#006633] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-[#006633] text-white h-14 flex items-center px-6">
          <Logo onDark />
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-8 max-w-md text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-[#333] mb-2">Quiz unavailable</h1>
            <p className="text-sm text-[#666] mb-4">{error}</p>
            <Link href="/join" className="btn-primary text-sm">Try another code</Link>
          </div>
        </div>
      </div>
    );
  }

  // Auto-joining spinner
  if (shouldAutoJoin && !joined) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-[#006633] text-white h-14 flex items-center px-6">
          <Logo onDark />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#006633] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Join screen
  if (!joined) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-[#006633] text-white h-14 flex items-center px-6">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <Logo onDark />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
              <h1 className="text-lg font-semibold text-[#333] mb-1">{quiz!.title}</h1>

              <div className="bg-[#f8f8f8] border border-[#e0e0e0] rounded p-4 mb-5 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#666]">Questions</span>
                  <span className="font-medium text-[#333]">{questions.length}</span>
                </div>
                {quiz!.time_limit_minutes && (
                  <div className="flex justify-between">
                    <span className="text-[#666]">Time limit</span>
                    <span className="font-medium text-[#333]">{quiz!.time_limit_minutes} mins</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#666]">Passing score</span>
                  <span className="font-medium text-[#333]">{quiz!.passing_score}%</span>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[#333] mb-1.5">Your name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999] pointer-events-none" />
                  <input
                    id="participant-name-input"
                    type="text"
                    value={participantName}
                    onChange={(e) => setParticipantName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <button
                id="start-quiz-btn"
                onClick={handleJoin}
                disabled={!participantName.trim()}
                className="btn-primary w-full min-h-[48px] text-[15px] transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
              >
                Start quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Results screen
  if (submitted && results) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-[#006633] text-white h-14 flex items-center px-6">
          <Logo onDark />
          <span className="text-base font-bold text-white ml-2">Quiz Complete</span>
        </header>
        <main className="flex-1 px-4 py-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border border-[#e0e0e0] rounded-lg p-6 mb-6 text-center">
              <div className={`w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold ${
                results.score >= quiz!.passing_score
                  ? "bg-green-50 text-green-700 border-2 border-green-200"
                  : "bg-red-50 text-red-700 border-2 border-red-200"
              }`}>
                {results.score}%
              </div>
              <h2 className="text-lg font-semibold text-[#333] mb-1">
                {results.score >= quiz!.passing_score ? "Passed!" : "Not passed"}
              </h2>
              <p className="text-sm text-[#666]">
                {results.correct} out of {results.total} correct
              </p>
              {isGuest && (
                <p className="text-xs text-[#999] mt-2">
                  Your results were not saved. Log in to track your progress.
                </p>
              )}
              {rank && (
                <p className="text-xs text-[#666] mt-2">
                  Ranked <span className="font-semibold text-[#006633]">#{rank.rank}</span>
                  {rank.total > 1 ? ` of ${rank.total}` : ""} on this quiz
                </p>
              )}
            </div>

            <h3 className="text-sm font-semibold text-[#333] mb-3">Review answers</h3>
            <div className="space-y-3">
              {results.detailed.map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-white border rounded-lg p-4 ${
                    item.isCorrect ? "border-green-200" : "border-red-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      item.isCorrect ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {item.isCorrect ? "✓" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#333] mb-2">{item.question.question_text}</p>

                      {item.question.options && (
                        <div className="space-y-1 mb-2">
                          {item.question.options.map((opt, optIdx) => {
                            const isSelected = item.selected === String(optIdx);
                            const isCorrectOpt = String(optIdx) === item.question.correct_answer;
                            return (
                              <div
                                key={optIdx}
                                className={`text-xs px-3 py-1.5 rounded border ${
                                  isCorrectOpt
                                    ? "bg-green-50 border-green-200 text-green-700"
                                    : isSelected && !isCorrectOpt
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : "bg-[#f8f8f8] border-[#e0e0e0] text-[#666]"
                                }`}
                              >
                                {String.fromCharCode(65 + optIdx)}. {opt}
                                {isCorrectOpt && " ✓"}
                                {isSelected && !isCorrectOpt && " ✗"}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {item.question.explanation && (
                        <p className="text-xs text-[#666] bg-[#f8f8f8] rounded p-2 mt-1">
                          <span className="font-medium">Explanation:</span> {item.question.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-6">
              <Link href="/dashboard" className="btn-primary text-sm">Close</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Quiz in progress — all questions in one scrollable page
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#006633] text-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <span className="text-sm font-medium truncate">{quiz!.title}</span>
          <div className="flex items-center gap-3">
            {timeLeft !== null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className={`w-4 h-4 ${timeLeft < 60 ? "animate-pulse" : ""}`} />
                <span className={timeLeft < 60 ? "text-red-300 font-bold" : ""}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            )}
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
        </div>
        {/* Sticky progress bar — fills as questions are answered, always visible */}
        <div className="max-w-3xl mx-auto px-4 pb-2">
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-300 ease-out"
              style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white border border-[#e0e0e0] rounded-lg p-4 sm:p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-[#006633] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-[15px] sm:text-sm font-medium text-[#333] leading-snug">{q.question_text}</p>
              </div>

              {q.options ? (
                <div className="space-y-2.5 sm:ml-9">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = answers[q.id] === String(optIdx);
                    return (
                      <button
                        key={optIdx}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(optIdx) }))}
                        aria-pressed={isSelected}
                        className={`w-full min-h-[44px] text-left px-4 py-2.5 rounded-lg border text-[15px] sm:text-sm flex items-center justify-between gap-2 transition-all duration-150 active:scale-[0.98] ${
                          isSelected
                            ? "border-[#006633] bg-green-50 text-[#006633] font-medium shadow-sm"
                            : "border-[#e0e0e0] bg-white text-[#333] hover:border-[#ccc]"
                        }`}
                      >
                        <span>
                          <span className="font-medium mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                          {opt}
                        </span>
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-150 ${
                            isSelected ? "bg-[#006633] border-[#006633]" : "border-[#ccc]"
                          }`}
                        >
                          {isSelected && (
                            <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 8.5 6.5 12 13 4.5" />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // True/false questions have no options array — render the two
                // canonical answers (stored as "true"/"false").
                <div className="flex gap-2.5 sm:ml-9">
                  {["true", "false"].map((val) => {
                    const isSelected = answers[q.id] === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                        aria-pressed={isSelected}
                        className={`flex-1 sm:flex-none min-h-[44px] px-6 rounded-lg border text-[15px] sm:text-sm transition-all duration-150 active:scale-[0.98] ${
                          isSelected
                            ? "border-[#006633] bg-green-50 text-[#006633] font-medium shadow-sm"
                            : "border-[#e0e0e0] bg-white text-[#333] hover:border-[#ccc]"
                        }`}
                      >
                        {val === "true" ? "True" : "False"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] sm:pb-3 bg-white/95 backdrop-blur border-t border-[#e0e0e0] flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount === 0}
              className="btn-primary w-full sm:w-auto gap-2 text-[15px] sm:text-sm px-8 min-h-[48px] shadow-lg disabled:opacity-50 transition-all duration-150 active:scale-[0.98]"
            >
              <Send className="w-4 h-4" />
              {submitting ? "Submitting..." : `Submit (${answeredCount}/${questions.length})`}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function selectedIsCorrect(q: Question, selected: string | undefined): boolean {
  if (!selected) return false;
  return selected === q.correct_answer;
}
