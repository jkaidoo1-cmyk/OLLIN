"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode, getDemoQuizzes, getDemoAttempts, getDemoUser } from "@/lib/demo";
import { Quiz, QuizAttempt } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import {
  Plus,
  Copy,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  BarChart3,
  Award,
} from "lucide-react";

const statusStyles: Record<string, string> = {
  published: "badge badge-success",
  active: "badge badge-primary",
  completed: "badge badge-slate",
  draft: "badge badge-warning",
  archived: "badge badge-slate",
};

export default function DashboardPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [allAttempts, setAllAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      if (isDemoMode()) {
        const demoUser = getDemoUser();
        if (demoUser) setUserName(demoUser.full_name.split(" ")[0]);
        const quizList = getDemoQuizzes();
        setQuizzes(quizList);
        // Gather attempts: hardcoded demo + localStorage + server-side (deduplicated)
        const attempts: QuizAttempt[] = [];
        for (const q of quizList) {
          attempts.push(...getDemoAttempts(q.id));
        }
        // Merge server-side attempts, deduplicate by id
        try {
          const res = await fetch(`/api/attempts`);
          if (res.ok) {
            const data = await res.json();
            const seenIds = new Set(attempts.map((a) => a.id));
            for (const a of data.attempts || []) {
              if (!seenIds.has(a.id)) {
                attempts.push(a);
                seenIds.add(a.id);
              }
            }
          }
        } catch { /* ignore */ }
        setAllAttempts(attempts);
        setLoading(false);
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        router.push("/login");
        return;
      }

      setUserName(user.user.user_metadata?.full_name?.split(" ")[0] || user.user.email?.split("@")[0] || "");

      const { data: quizData } = await supabase
        .from("quizzes").select("*").eq("host_id", user.user.id)
        .order("created_at", { ascending: false });

      if (quizData) {
        setQuizzes(quizData);
        const attempts: QuizAttempt[] = [];
        for (const q of quizData) {
          const { data: attData } = await supabase
            .from("quiz_attempts").select("*").eq("quiz_id", q.id).eq("status", "completed");
          if (attData) attempts.push(...attData);
        }
        setAllAttempts(attempts);
      }
      setLoading(false);
    };
    fetchData();
  }, [supabase, router]);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Derived stats ─────────────────────────
  const publishedCount = quizzes.filter((q) => q.status === "published").length;
  const totalParticipants = allAttempts.length;
  const avgScore = totalParticipants > 0
    ? Math.round(allAttempts.reduce((s, a) => s + a.score_percentage, 0) / totalParticipants)
    : 0;
  const passCount = allAttempts.filter((a) => a.score_percentage >= 60).length;
  const passRate = totalParticipants > 0 ? Math.round((passCount / totalParticipants) * 100) : 0;

  // Per-quiz stats
  const quizStats = quizzes.map((quiz) => {
    const quizAttempts = allAttempts.filter((a) => a.quiz_id === quiz.id);
    const completed = quizAttempts.filter((a) => a.status === "completed");
    const avg = completed.length > 0
      ? Math.round(completed.reduce((s, a) => s + a.score_percentage, 0) / completed.length)
      : 0;
    return { quiz, attempts: completed.length, avgScore: avg };
  });

  // Recent activity (last 10 attempts)
  const recentAttempts = [...allAttempts]
    .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <div className="py-6">
        <div className="h-6 w-40 bg-[#e0e0e0] rounded mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-[#e0e0e0] rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white border border-[#e0e0e0] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#333]">
          {userName ? `Hi, ${userName}!` : "Dashboard"}
        </h1>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total quizzes", value: quizzes.length, icon: BarChart3, color: "bg-green-100 text-green-700" },
          { label: "Published", value: publishedCount, icon: Award, color: "bg-blue-100 text-blue-700" },
          { label: "Participants", value: totalParticipants, icon: Users, color: "bg-purple-100 text-purple-700" },
          { label: "Avg score", value: totalParticipants > 0 ? `${avgScore}%` : "—", icon: TrendingUp, color: "bg-amber-100 text-amber-700" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-[#e0e0e0] rounded-lg p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${stat.color}`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-[#333]">{stat.value}</p>
            <p className="text-xs text-[#999]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quiz Performance */}
      {quizStats.some((s) => s.attempts > 0) && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-8">
          <h2 className="text-sm font-bold text-[#333] mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-green-600" />
            Quiz performance
          </h2>
          <div className="space-y-4">
            {quizStats
              .filter((s) => s.attempts > 0)
              .map((s) => (
                <div key={s.quiz.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Link
                      href={`/dashboard/quizzes/${s.quiz.id}`}
                      className="text-sm font-medium text-[#333] hover:text-[#006633] no-underline truncate"
                    >
                      {s.quiz.title}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-[#999] flex-shrink-0 ml-3">
                      <span>{s.attempts} attempt{s.attempts !== 1 ? "s" : ""}</span>
                      <span className={`font-bold ${s.avgScore >= 60 ? "text-green-600" : "text-red-500"}`}>
                        {s.avgScore}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s.avgScore >= 70 ? "bg-green-500" : s.avgScore >= 50 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${s.avgScore}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Score Distribution */}
      {totalParticipants > 0 && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-8">
          <h2 className="text-sm font-bold text-[#333] mb-4">Score distribution</h2>
          <div className="flex items-end gap-1 h-28">
            {Array.from({ length: 10 }, (_, i) => {
              const lo = i * 10;
              const hi = lo + 10;
              const count = allAttempts.filter((a) => a.score_percentage >= lo && a.score_percentage < hi).length;
              const maxCount = Math.max(1, ...Array.from({ length: 10 }, (_, j) =>
                allAttempts.filter((a) => a.score_percentage >= j * 10 && a.score_percentage < (j + 1) * 10).length
              ));
              const heightPct = (count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group" title={`${lo}–${hi}%: ${count} participants`}>
                  <div
                    className="w-full rounded-t transition-all duration-300 group-hover:opacity-80"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: count > 0 ? "4px" : "2px",
                      background: count > 0 ? "#006633" : "rgba(148,163,184,0.15)",
                    }}
                  />
                  <span className="text-[9px] text-[#999]">{lo}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-[#999] mt-1 px-0.5">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentAttempts.length > 0 && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg mb-8">
          <div className="px-5 py-4 border-b border-[#e0e0e0]">
            <h2 className="text-sm font-bold text-[#333]">Recent results</h2>
          </div>
          <div className="divide-y divide-[#e0e0e0]">
            {recentAttempts.map((att) => {
              const quiz = quizzes.find((q) => q.id === att.quiz_id);
              const passed = att.score_percentage >= 60;
              return (
                <div key={att.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {Math.round(att.score_percentage)}%
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#333] truncate">
                        {att.participant_name || "Anonymous"}
                      </p>
                      <p className="text-xs text-[#999] truncate">
                        {quiz?.title || "Quiz"}
                        {att.time_taken_seconds ? ` · ${Math.floor(att.time_taken_seconds / 60)}m ${att.time_taken_seconds % 60}s` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`badge text-xs flex-shrink-0 ${passed ? "badge-success" : "badge-danger"}`}>
                    {passed ? "Passed" : "Failed"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[#333]">Your quizzes</h2>
        <Link href="/dashboard/create" id="new-quiz-btn" className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          New quiz
        </Link>
      </div>

      {/* Quiz list */}
      {quizzes.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <p className="text-sm text-[#666] mb-4">You haven&apos;t created any quizzes yet.</p>
          <Link href="/dashboard/create" className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            Create your first quiz
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {quizzes.map((quiz) => {
            const qAttempts = allAttempts.filter((a) => a.quiz_id === quiz.id);
            return (
              <div
                key={quiz.id}
                className="bg-white border border-[#e0e0e0] rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[#333] truncate">{quiz.title}</h3>
                    <span className={statusStyles[quiz.status] || "badge badge-slate"}>
                      {quiz.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-[#999]">{formatRelativeDate(quiz.created_at)}</span>
                    {quiz.time_limit_minutes && (
                      <span className="flex items-center gap-1 text-xs text-[#999]">
                        <Clock className="w-3 h-3" />
                        {quiz.time_limit_minutes}m
                      </span>
                    )}
                    {qAttempts.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-[#999]">
                        <Users className="w-3 h-3" />
                        {qAttempts.length} attempt{qAttempts.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button
                      onClick={() => copyCode(quiz.share_code, quiz.id)}
                      className="flex items-center gap-1 text-xs font-mono text-[#006633] hover:text-[#005528]"
                    >
                      {copiedId === quiz.id ? (
                        <><CheckCircle className="w-3 h-3" /> Copied</>
                      ) : (
                        <><Copy className="w-3 h-3" />{quiz.share_code}</>
                      )}
                    </button>
                  </div>
                </div>
                <Link
                  href={`/dashboard/quizzes/${quiz.id}`}
                  className="text-xs text-[#006633] hover:text-[#005528] font-medium ml-4"
                >
                  Results
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
