"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode, getDemoQuizById, getDemoQuestions, getDemoAttempts } from "@/lib/demo";
import { Quiz, Question, QuizAttempt } from "@/lib/types";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Users,
  Clock,
  CheckCircle,
  TrendingUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Award,
  Check,
} from "lucide-react";

interface AttemptWithAnswers extends QuizAttempt {
  attempt_answers?: {
    question_id: string;
    selected_answer: string | null;
    is_correct: boolean | null;
    marks_awarded: number;
  }[];
}

export default function QuizDetailPage() {
  const params = useParams();
  const quizId = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<AttemptWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const fetchQuiz = async () => {
      if (isDemoMode()) {
        const demoQuiz = getDemoQuizById(quizId);
        if (demoQuiz) {
          setQuiz(demoQuiz);
          setQuestions(getDemoQuestions(quizId));
          // Merge localStorage attempts + server-side attempts
          const localAttempts = getDemoAttempts(quizId);
          let serverAttempts: typeof localAttempts = [];
          try {
            const res = await fetch(`/api/attempts?quiz_id=${quizId}`);
            if (res.ok) {
              const data = await res.json();
              serverAttempts = data.attempts || [];
            }
          } catch { /* ignore */ }
          // Merge, deduplicate by id
          const seenIds = new Set(localAttempts.map((a) => a.id));
          const merged = [...localAttempts, ...serverAttempts.filter((a) => !seenIds.has(a.id))];
          setAttempts(merged);
        }
        setLoading(false);
        return;
      }

      if (!supabase) { setLoading(false); return; }
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data: quizData } = await supabase
        .from("quizzes")
        .select("*")
        .eq("id", quizId)
        .single();

      if (!quizData) {
        setLoading(false);
        return;
      }

      setQuiz(quizData);

      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("order_index");

      if (qData) setQuestions(qData);

      const { data: attemptData } = await supabase
        .from("quiz_attempts")
        .select("*, attempt_answers(*)")
        .eq("quiz_id", quizId)
        .order("created_at", { ascending: false });

      if (attemptData) setAttempts(attemptData);

      setLoading(false);
    };

    fetchQuiz();
  }, [quizId, supabase, router]);

  const completedAttempts = attempts.filter((a) => a.status === "completed");
  const avgScore =
    completedAttempts.length > 0
      ? Math.round(
          completedAttempts.reduce((sum, a) => sum + a.score_percentage, 0) /
            completedAttempts.length
        )
      : 0;
  const avgTime =
    completedAttempts.length > 0
      ? Math.round(
          completedAttempts
            .filter((a) => a.time_taken_seconds)
            .reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0) /
            Math.max(
              1,
              completedAttempts.filter((a) => a.time_taken_seconds).length
            )
        )
      : 0;
  const passCount = completedAttempts.filter(
    (a) => a.score_percentage >= (quiz?.passing_score || 50)
  ).length;

  const questionStats = questions.map((q) => {
    const answersOnQ = completedAttempts.flatMap((a) =>
      (a.attempt_answers || []).filter((aa) => aa.question_id === q.id)
    );
    const correctCount = answersOnQ.filter((aa) => aa.is_correct).length;
    return {
      question: q,
      totalAnswers: answersOnQ.length,
      correctPercentage:
        answersOnQ.length > 0
          ? Math.round((correctCount / answersOnQ.length) * 100)
          : 0,
    };
  });

  const copyCode = () => {
    if (quiz) {
      navigator.clipboard.writeText(quiz.share_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-[#e0e0e0] rounded rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-[#e0e0e0] rounded rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-[#e0e0e0] rounded rounded-xl" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Quiz not found.</p>
        <Link href="/dashboard/quizzes" className="text-green-600 hover:underline text-xs mt-2 inline-block font-semibold">
          Back to My Quizzes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Top Breadcrumb & Header */}
      <div className="mb-8 ">
        <Link
          href="/dashboard/quizzes"
          className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:underline mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> My Quizzes
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#333]">{quiz.title}</h1>
              <span className={`badge capitalize ${quiz.status === "published" ? "badge-success" : "badge-slate"}`}>
                {quiz.status}
              </span>
            </div>
            {quiz.description && (
              <p className="text-slate-500 text-sm mt-1">{quiz.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-mono font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              {quiz.share_code}
            </button>
            <Link
              href={`/quiz/${quiz.share_code}`}
              target="_blank"
              className="btn-primary text-xs py-2"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Preview Quiz
            </Link>
          </div>
        </div>
      </div>

      {/* Analytics Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Attempts", value: attempts.length, icon: Users, color: "from-green-400 to-violet-500" },
          { label: "Average Score", value: `${avgScore}%`, icon: TrendingUp, color: "from-emerald-400 to-teal-500" },
          { label: "Avg Time", value: avgTime > 0 ? `${Math.floor(avgTime / 60)}m ${avgTime % 60}s` : "N/A", icon: Clock, color: "from-amber-400 to-orange-500" },
          { label: "Pass Rate", value: completedAttempts.length > 0 ? `${Math.round((passCount / completedAttempts.length) * 100)}%` : "N/A", icon: Award, color: "from-cyan-400 to-blue-500" },
        ].map((stat, i) => (
          <div key={stat.label} className="card p-4 " style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 bg-gradient-to-br ${stat.color}`}>
              <stat.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-xl font-bold text-[#333]">{stat.value}</p>
            <p className="text-[11px] text-slate-400 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Score Distribution Chart */}
      {completedAttempts.length > 0 && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-6 mb-8 " >
          <h2 className="font-bold text-sm mb-4 text-[#333]">Score Distribution</h2>
          <div className="flex items-end gap-1.5 h-32 pt-4">
            {Array.from({ length: 10 }, (_, i) => {
              const bucketMin = i * 10;
              const count = completedAttempts.filter(
                (a) => a.score_percentage >= bucketMin && a.score_percentage < bucketMin + 10
              ).length;
              const maxCount = Math.max(
                1,
                ...Array.from({ length: 10 }, (_, j) =>
                  completedAttempts.filter(
                    (a) => a.score_percentage >= j * 10 && a.score_percentage < (j + 1) * 10
                  ).length
                )
              );
              const heightPct = (count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div
                    className="w-full rounded-t-lg transition-all duration-300 group-hover:bg-green-600"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: count > 0 ? "6px" : "2px",
                      background: count > 0 ? "#006633" : "rgba(148,163,184,0.15)",
                    }}
                  />
                  <span className="text-[9px] text-slate-400 font-semibold">{bucketMin}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Question Performance Breakdown */}
      {questionStats.length > 0 && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-6 mb-8 " >
          <h2 className="font-bold text-sm mb-4 flex items-center gap-2 text-[#333]">
            <BarChart3 className="w-4 h-4 text-green-600" />
            Question Success Rates
          </h2>
          <div className="space-y-3">
            {questionStats.map((qs, idx) => (
              <div key={qs.question.id} className="flex items-center gap-4 text-xs">
                <span className="w-6 font-mono font-bold text-slate-400">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-700 truncate">{qs.question.question_text}</p>
                </div>
                <div className="w-36 flex items-center gap-2 flex-shrink-0">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        qs.correctPercentage >= 70
                          ? "bg-emerald-500"
                          : qs.correctPercentage >= 40
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${qs.correctPercentage}%` }}
                    />
                  </div>
                  <span className="font-bold w-8 text-right text-slate-600">{qs.correctPercentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participant Results Table */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg " >
        <div className="px-6 py-4 border-b flex items-center justify-between" >
          <h2 className="font-bold text-sm flex items-center gap-2 text-[#333]">
            <Users className="w-4 h-4 text-green-600" />
            Participants ({attempts.length})
          </h2>
        </div>

        {attempts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No attempts recorded yet. Share the code to invite quiz takers!
          </div>
        ) : (
          <div className="divide-y" >
            {attempts.map((attempt) => {
              const isExpanded = expandedAttempt === attempt.id;
              const isPass = attempt.score_percentage >= (quiz.passing_score || 50);
              return (
                <div key={attempt.id}>
                  <button
                    onClick={() => setExpandedAttempt(isExpanded ? null : attempt.id)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          isPass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {Math.round(attempt.score_percentage)}%
                      </div>
                      <div>
                        <p className="font-bold text-sm text-[#333]">
                          {attempt.participant_name || "Anonymous Participant"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {attempt.correct_answers}/{attempt.total_questions} correct
                          {attempt.time_taken_seconds ? ` · ${Math.floor(attempt.time_taken_seconds / 60)}m ${attempt.time_taken_seconds % 60}s` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${isPass ? "badge-success" : "badge-danger"}`}>
                        {isPass ? "Passed" : "Failed"}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  {isExpanded && attempt.attempt_answers && (
                    <div className="px-6 pb-4 pt-2 bg-slate-50/50 border-t" >
                      <div className="space-y-2">
                        {attempt.attempt_answers.map((aa, idx) => {
                          const q = questions.find((q) => q.id === aa.question_id);
                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                                aa.is_correct ? "bg-emerald-50/60 text-emerald-800" : "bg-red-50/60 text-red-800"
                              }`}
                            >
                              <CheckCircle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${aa.is_correct ? "text-emerald-600" : "text-red-500"}`} />
                              <div className="flex-1">
                                <p className="font-semibold">{q?.question_text || "Question"}</p>
                                <p className="mt-0.5 opacity-80">
                                  Answered: {formatAnswer(q, aa.selected_answer)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatAnswer(q: Question | undefined, answer: string | null | undefined): string {
  if (!q || !answer) return "—";
  if (q.question_type === "multiple_choice" && q.options) {
    const idx = parseInt(answer);
    if (!isNaN(idx) && q.options[idx]) {
      return `${String.fromCharCode(65 + idx)}. ${q.options[idx]}`;
    }
  }
  return answer;
}
