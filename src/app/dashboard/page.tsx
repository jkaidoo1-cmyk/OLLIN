"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalQuizzes, getLocalAttempts, getLocalUser } from "@/lib/local";
import { SkeletonText, SkeletonStats } from "@/components/Skeleton";
import { warmResource } from "@/lib/prefetch";
import { Quiz, QuizAttempt } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import {
  Plus,
  Copy,
  CheckCircle,
  Clock,
  Users,
  ArrowRight,
  FileText,
  BookOpen,
  Trophy,
  TrendingUp,
  BarChart3,
} from "lucide-react";

export default function DashboardPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [allAttempts, setAllAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Score distribution for the selected quiz (from the stats endpoint)
  const [distribution, setDistribution] = useState<{ bucket: string; count: number }[]>([]);
  const [distQuizId, setDistQuizId] = useState<string>("");
  const [statsLoading, setStatsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      if (isLocalMode()) {
        const localUser = getLocalUser();
        if (localUser) setUserName(localUser.full_name.split(" ")[0]);
        // Warmed on layout mount — typically already resolved at first paint.
        const quizList = await warmResource<Quiz[]>("quizzes", async () => getLocalQuizzes());
        setQuizzes(quizList);
        const attempts: QuizAttempt[] = [];
        for (const q of quizList) {
          attempts.push(...getLocalAttempts(q.id));
        }
        try {
          // The all-attempts endpoint is admin-only now; creators fetch per
          // quiz, which the attempts API permits for the quiz's host.
          for (const q of quizList) {
            const res = await fetch(`/api/attempts?quiz_id=${encodeURIComponent(q.id)}`);
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
          }
        } catch { /* ignore */ }
        setAllAttempts(attempts);
        setLoading(false);
        return;
      }

      if (!supabase) {
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

  // Load the score distribution for one quiz via the stats endpoint.
  const loadDistribution = async (quizId: string) => {
    if (!quizId) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/attempts/stats?quiz_id=${encodeURIComponent(quizId)}`);
      if (res.ok) {
        const data = await res.json();
        setDistribution(data.distribution || []);
      } else {
        setDistribution([]);
      }
    } catch {
      setDistribution([]);
    } finally {
      setStatsLoading(false);
    }
  };

  // Auto-select the first quiz that has attempts once the dashboard data lands.
  const firstQuizWithAttempts = quizzes.find((q) => allAttempts.some((a) => a.quiz_id === q.id));
  useEffect(() => {
    if (!loading && !distQuizId && firstQuizWithAttempts) {
      setDistQuizId(firstQuizWithAttempts.id);
      loadDistribution(firstQuizWithAttempts.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, firstQuizWithAttempts?.id]);

  // Derived stats
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

  // Recent attempts
  const recentAttempts = [...allAttempts]
    .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="py-6 space-y-4" aria-busy="true">
        <SkeletonText className="h-8 w-48" />
        <SkeletonStats />
        <div className="skeleton h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome + Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#333]">
            Welcome back{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-sm text-[#999] mt-0.5">
            {quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""} · {totalParticipants} total attempt{totalParticipants !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/create" className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            New quiz
          </Link>
          <Link
            href="/join"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#006633] bg-white border border-[#006633] rounded-md hover:bg-[#f0f8f2] transition-colors no-underline"
          >
            Join quiz
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Quizzes", value: quizzes.length, sub: `${publishedCount} published`, color: "text-[#006633]", bg: "bg-[#e6f0e8]" },
          { label: "Attempts", value: totalParticipants, sub: "total submissions", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Avg Score", value: totalParticipants > 0 ? `${avgScore}%` : "—", sub: "across all quizzes", color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Pass Rate", value: totalParticipants > 0 ? `${passRate}%` : "—", sub: `${passCount} passed`, color: "text-green-600", bg: "bg-green-50" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-[#e0e0e0] rounded-lg p-4">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-sm font-medium text-[#333] mt-0.5">{stat.label}</p>
            <p className="text-xs text-[#999] mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: My Quizzes (takes 2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#333] uppercase tracking-wide">My Quizzes</h2>
            <Link href="/dashboard/quizzes" className="text-xs text-[#006633] hover:text-[#005528] font-medium no-underline">
              View all →
            </Link>
          </div>

          {quizzes.length === 0 ? (
            <div className="bg-white border border-[#e0e0e0] rounded-lg p-10 text-center">
              <FileText className="w-10 h-10 text-[#ccc] mx-auto mb-3" />
              <p className="text-sm text-[#666] mb-3">No quizzes yet</p>
              <Link href="/dashboard/create" className="btn-primary text-sm">
                <Plus className="w-4 h-4" />
                Create your first quiz
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8f8f8] border-b border-[#e0e0e0]">
                    <th className="text-left px-4 py-2.5 font-medium text-[#666]">Quiz</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#666] hidden sm:table-cell">Code</th>
                    <th className="text-center px-4 py-2.5 font-medium text-[#666]">Attempts</th>
                    <th className="text-center px-4 py-2.5 font-medium text-[#666] hidden sm:table-cell">Avg</th>
                    <th className="text-right px-4 py-2.5 font-medium text-[#666]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                  {quizzes.slice(0, 5).map((quiz) => {
                    const qAttempts = allAttempts.filter((a) => a.quiz_id === quiz.id);
                    const completed = qAttempts.filter((a) => a.status === "completed");
                    const avg = completed.length > 0
                      ? Math.round(completed.reduce((s, a) => s + a.score_percentage, 0) / completed.length)
                      : 0;
                    const statusColor: Record<string, string> = {
                      published: "text-green-600 bg-green-50",
                      draft: "text-amber-600 bg-amber-50",
                      completed: "text-blue-600 bg-blue-50",
                      active: "text-blue-600 bg-blue-50",
                    };
                    return (
                      <tr key={quiz.id} className="hover:bg-[#fafafa] transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/quizzes/${quiz.id}`} className="text-[#333] hover:text-[#006633] font-medium no-underline">
                            {quiz.title}
                          </Link>
                          <p className="text-xs text-[#999] mt-0.5 sm:hidden">{quiz.share_code}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <button
                            onClick={() => copyCode(quiz.share_code, quiz.id)}
                            className="text-xs font-mono text-[#006633] hover:text-[#005528] bg-transparent border-none cursor-pointer p-0"
                          >
                            {copiedId === quiz.id ? (
                              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Copied</span>
                            ) : (
                              <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> {quiz.share_code}</span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center text-[#666]">{completed.length}</td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {completed.length > 0 ? (
                            <span className={`font-semibold ${avg >= 60 ? "text-green-600" : "text-red-500"}`}>
                              {avg}%
                            </span>
                          ) : (
                            <span className="text-[#ccc]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColor[quiz.status] || "text-[#666] bg-[#f0f0f0]"}`}>
                            {quiz.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-4">
          {/* Quiz Performance */}
          {quizStats.some((s) => s.attempts > 0) && (
            <div className="bg-white border border-[#e0e0e0] rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[#333] mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#006633]" />
                Performance
              </h2>
              <div className="space-y-3">
                {quizStats
                  .filter((s) => s.attempts > 0)
                  .map((s) => (
                    <div key={s.quiz.id}>
                      <div className="flex items-center justify-between mb-1">
                        <Link
                          href={`/dashboard/quizzes/${s.quiz.id}`}
                          className="text-xs font-medium text-[#333] hover:text-[#006633] no-underline truncate max-w-[70%]"
                        >
                          {s.quiz.title}
                        </Link>
                        <span className={`text-xs font-bold ${s.avgScore >= 60 ? "text-green-600" : "text-red-500"}`}>
                          {s.avgScore}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s.avgScore >= 70 ? "bg-green-500" : s.avgScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${s.avgScore}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#999] mt-0.5">{s.attempts} attempt{s.attempts !== 1 ? "s" : ""}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Score Distribution */}
          {quizzes.some((q) => allAttempts.some((a) => a.quiz_id === q.id)) && (
            <div className="bg-white border border-[#e0e0e0] rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[#333] mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#006633]" />
                Score Distribution
              </h2>
              {quizzes.some((q) => allAttempts.some((a) => a.quiz_id === q.id)) && (
                <select
                  className="w-full text-xs border border-[#e0e0e0] rounded-md px-2 py-1.5 bg-white text-[#333] mb-3"
                  value={distQuizId || ""}
                  onChange={(e) => {
                    setDistQuizId(e.target.value);
                    loadDistribution(e.target.value);
                  }}
                >
                  {quizzes
                    .filter((q) => allAttempts.some((a) => a.quiz_id === q.id))
                    .map((q) => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                </select>
              )}
              {statsLoading ? (
                <p className="text-xs text-[#999] text-center py-4">Loading…</p>
              ) : distribution.length === 0 ? (
                <p className="text-xs text-[#999] text-center py-4">Select a quiz to see results</p>
              ) : (
                <div className="flex items-end gap-1 h-24">
                  {distribution.map((d) => {
                    const max = Math.max(...distribution.map((x) => x.count), 1);
                    return (
                      <div key={d.bucket} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div
                          className={`w-full rounded-t ${d.count > 0 ? "bg-[#006633]" : "bg-[#f0f0f0]"}`}
                          style={{ height: `${(d.count / max) * 80}px`, minHeight: d.count > 0 ? "4px" : "2px" }}
                        />
                        <span className="text-[8px] text-[#999] whitespace-nowrap">
                          {d.bucket === "90-100" ? "90+" : d.bucket.split("-")[0]}
                        </span>
                        {d.count > 0 && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#333] text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            {d.count} student{d.count !== 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-4">
            <h2 className="text-sm font-semibold text-[#333] mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#006633]" />
              Recent Activity
            </h2>
            {recentAttempts.length === 0 ? (
              <p className="text-xs text-[#999] text-center py-4">No activity yet</p>
            ) : (
              <div className="space-y-2.5">
                {recentAttempts.map((att) => {
                  const quiz = quizzes.find((q) => q.id === att.quiz_id);
                  const passed = att.score_percentage >= 60;
                  return (
                    <div key={att.id} className="flex items-start gap-2.5">
                      <div className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${passed ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                        {Math.round(att.score_percentage)}%
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#333] truncate">
                          {att.participant_name || "Anonymous"}
                        </p>
                        <p className="text-[10px] text-[#999] truncate">
                          {quiz?.title || "Quiz"}
                          {att.time_taken_seconds ? ` · ${Math.floor(att.time_taken_seconds / 60)}m` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-4">
            <h2 className="text-sm font-semibold text-[#333] mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#006633]" />
              Quick Links
            </h2>
            <div className="space-y-1">
              {[
                { href: "/dashboard/create", label: "Create a quiz", icon: Plus },
                { href: "/dashboard/test-quizzes", label: "Test quizzes", icon: Trophy },
                { href: "/join", label: "Join by code", icon: ArrowRight },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-[#333] hover:bg-[#f8f8f8] rounded-md transition-colors no-underline"
                >
                  <link.icon className="w-3.5 h-3.5 text-[#006633]" />
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
