"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode, getDemoQuizByCode, getDemoQuestions, getDemoUser } from "@/lib/demo";
import { Quiz, Question, QuizAttempt } from "@/lib/types";
import { Brain, Clock, ChevronLeft, ChevronRight, Send, CheckCircle, AlertCircle, User } from "lucide-react";
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
  const [currentUser, setCurrentUser] = useState<{ name: string; isGuest: boolean } | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
      if (isDemoMode()) {
        const demoUser = getDemoUser();
        if (demoUser) {
          setCurrentUser({ name: demoUser.full_name, isGuest: false });
          setParticipantName(demoUser.full_name);
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
      // Always try the public API first (works for guests, demo, and logged-in users)
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

      // Try demo mode localStorage
      if (isDemoMode()) {
        const demoQuiz = getDemoQuizByCode(code);
        if (demoQuiz && demoQuiz.status !== "draft") {
          setQuiz(demoQuiz);
          setQuestions(getDemoQuestions(demoQuiz.id));
        } else if (demoQuiz) {
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

    if (isGuest || isDemoMode()) {
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

    let correct = 0;
    const detailed = questions.map((q) => {
      const selected = answers[q.id] || null;
      const isCorrect = selected === q.correct_answer;
      if (isCorrect) correct++;
      return { question: q, selected, isCorrect };
    });

    const score = Math.round((correct / questions.length) * 100);

    // Save to database for logged-in students (not guests, not demo)
    if (attempt && !isGuest && !isDemoMode() && supabase) {
      const timeTaken = quiz.time_limit_minutes
        ? quiz.time_limit_minutes * 60 - (timeLeft || 0)
        : null;

      await supabase.from("quiz_attempts").update({
        completed_at: new Date().toISOString(),
        time_taken_seconds: timeTaken,
        correct_answers: correct,
        score_percentage: score,
        total_questions: questions.length,
        marks_earned: correct,
        marks_total: questions.length,
        status: "completed",
      }).eq("id", attempt.id);

      const answerInserts = questions.map((q) => ({
        attempt_id: attempt.id,
        question_id: q.id,
        selected_answer: answers[q.id] || null,
        is_correct: selectedIsCorrect(q, answers[q.id]),
        marks_awarded: selectedIsCorrect(q, answers[q.id]) ? q.marks : 0,
      }));
      await supabase.from("attempt_answers").insert(answerInserts);
    }

    // Save attempt server-side (so quiz creator can see it regardless of browser)
    const timeTaken = quiz.time_limit_minutes
      ? quiz.time_limit_minutes * 60 - (timeLeft || 0)
      : null;

    try {
      await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: quiz.id,
          participant_name: participantName || "Anonymous",
          score_percentage: score,
          correct_answers: correct,
          total_questions: questions.length,
          time_taken_seconds: timeTaken,
          status: "completed",
          completed_at: new Date().toISOString(),
        }),
      });
    } catch { /* non-critical, continue */ }

    // Also save to localStorage for demo mode
    if (isDemoMode()) {
      const { saveDemoAttempt } = await import("@/lib/demo");
      saveDemoAttempt({
        id: `att-${Date.now()}`,
        quiz_id: quiz.id,
        participant_name: participantName || "Anonymous",
        score_percentage: score,
        correct_answers: correct,
        total_questions: questions.length,
        time_taken_seconds: timeTaken,
        answers,
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      const { addNotification } = await import("@/lib/demo");
      addNotification(
        "New attempt",
        `${participantName || "Someone"} completed your "${quiz.title}" quiz with a score of ${score}%.`,
        "result"
      );
    }

    localStorage.removeItem(`quiz_${quiz.id}_answers`);

    setResults({ score, total: questions.length, correct, detailed });
    setSubmitted(true);
    setSubmitting(false);
  }, [submitting, submitted, quiz, questions, answers, attempt, timeLeft, isGuest, participantName, supabase]);

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
          <Brain className="w-5 h-5 text-white" />
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
          <Brain className="w-5 h-5 text-white" />
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
          <Brain className="w-5 h-5 text-white" />
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
            <Brain className="w-5 h-5 text-white" />
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
                className="btn-primary w-full py-2.5"
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
          <Brain className="w-5 h-5 text-white" />
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

  // Quiz in progress
  const q = questions[currentQ];
  if (!q) return null;

  const progress = ((currentQ + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#006633] text-white sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <span className="text-sm font-medium truncate">{quiz!.title}</span>
          <div className="flex items-center gap-3">
            {timeLeft !== null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="w-4 h-4" />
                <span className={timeLeft < 60 ? "text-red-300 font-bold" : ""}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            )}
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {currentQ + 1}/{questions.length}
            </span>
          </div>
        </div>
        <div className="h-0.5 bg-white/20">
          <div className="h-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-4">
            <p className="text-sm font-medium text-[#333] mb-4">{q.question_text}</p>

            {q.options && (
              <div className="space-y-2">
                {q.options.map((opt, idx) => {
                  const isSelected = answers[q.id] === String(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(idx) }))}
                      className={`w-full text-left px-4 py-3 rounded border text-sm transition-colors ${
                        isSelected
                          ? "border-[#006633] bg-green-50 text-[#006633] font-medium"
                          : "border-[#e0e0e0] bg-white text-[#333] hover:border-[#ccc]"
                      }`}
                    >
                      <span className="font-medium mr-2">{String.fromCharCode(65 + idx)}.</span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
              disabled={currentQ === 0}
              className="flex items-center gap-1 px-4 py-2 text-sm text-[#666] hover:text-[#333] disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {currentQ === questions.length - 1 ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary flex items-center gap-2 text-sm px-6"
              >
                <Send className="w-4 h-4" />
                {submitting ? "Submitting..." : "Submit"}
              </button>
            ) : (
              <button
                onClick={() => setCurrentQ(Math.min(questions.length - 1, currentQ + 1))}
                className="flex items-center gap-1 px-4 py-2 text-sm text-[#006633] font-medium hover:text-[#004d26]"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentQ(idx)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                  idx === currentQ
                    ? "bg-[#006633] text-white"
                    : answers[questions[idx].id]
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-[#f0f0f0] text-[#666] border border-[#e0e0e0]"
                }`}
              >
                {idx + 1}
              </button>
            ))}
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
