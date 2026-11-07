"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalQuizzes, getLocalAttempts, getLocalUser } from "@/lib/local";
import { SkeletonText, SkeletonStats } from "@/components/Skeleton";
import { warmResource } from "@/lib/prefetch";
import { Quiz, QuizAttempt } from "@/lib/types";
import { Plus, ArrowRight, ArrowUpRight, ClipboardList } from "lucide-react";

const statDot = ["#1f9d63", "#3b6fd4", "#e9a13b", "#1f9d63"];

export default function DashboardPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [allAttempts, setAllAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [code, setCode] = useState("");
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

  const joinQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!clean) return;
    setCode("");
    router.push(`/quiz/${clean}`);
  };

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
    const completed = allAttempts.filter((a) => a.quiz_id === quiz.id && a.status === "completed");
    const avg = completed.length > 0
      ? Math.round(completed.reduce((s, a) => s + a.score_percentage, 0) / completed.length)
      : 0;
    return { quiz, attempts: completed.length, avgScore: avg };
  });

  if (loading) {
    return (
      <div className="pt-3 space-y-4" aria-busy="true">
        <SkeletonText className="h-9 w-40" />
        <SkeletonText className="h-14 w-full" />
        <SkeletonText className="h-40 w-full" />
        <SkeletonStats />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Greeting */}
      <div>
        <h1 className="greeting">Hi{userName ? `, ${userName}` : " there"}</h1>
        <p className="greeting-sub">Make a quiz, or jump into one with a code.</p>
      </div>

      {/* Join by code */}
      <form onSubmit={joinQuiz} className="join-pill">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter quiz code"
          aria-label="Quiz code"
          maxLength={9}
        />
        <button type="submit" disabled={!code.trim()}>Join</button>
      </form>

      {/* Create */}
      <Link href="/dashboard/create" className="hero-card block no-underline">
        <h2>Create a new quiz</h2>
        <p>Add questions, set a pass mark and share it in seconds.</p>
        <span className="hero-btn">
          <Plus className="w-4 h-4" />
          New quiz
        </span>
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Quizzes published", value: publishedCount, dot: statDot[0] },
          { label: "Total attempts", value: totalParticipants, dot: statDot[1] },
          { label: "Avg score", value: totalParticipants > 0 ? `${avgScore}%` : "—", dot: statDot[2] },
          { label: "Pass rate", value: totalParticipants > 0 ? `${passRate}%` : "—", dot: statDot[3] },
        ].map((stat) => (
          <div key={stat.label} className="stat-tile">
            <span className="stat-dot" style={{ background: stat.dot }} />
            <p className="stat-value">{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* My quizzes */}
      <div>
        <div className="section-head">
          <h2>My quizzes</h2>
          <Link href="/dashboard/quizzes" className="section-link">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {quizzes.length === 0 ? (
          <Link href="/dashboard/create" className="list-row app-card no-underline">
            <span className="tile-icon">
              <ClipboardList className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-[var(--ink)]">No quizzes yet</span>
              <span className="block text-xs text-[var(--ink-muted)]">Tap + to create your first one</span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
          </Link>
        ) : (
          <div className="list-card">
            {quizzes.slice(0, 4).map((quiz) => {
              const stats = quizStats.find((s) => s.quiz.id === quiz.id);
              return (
                <Link
                  key={quiz.id}
                  href={`/dashboard/quizzes/${quiz.id}`}
                  className="list-row no-underline"
                >
                  <span className="tile-icon">
                    <ClipboardList className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-[var(--ink)] truncate">{quiz.title}</span>
                    <span className="block text-xs text-[var(--ink-muted)]">
                      {stats?.attempts || 0} attempt{stats?.attempts === 1 ? "" : "s"} · {quiz.share_code}
                    </span>
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-[var(--ink-faint)] shrink-0" />
                </Link>
              );
            })}
            {quizzes.length > 4 && (
              <Link href="/dashboard/quizzes" className="list-row justify-center no-underline">
                <span className="text-xs font-semibold text-[var(--primary)]">
                  View all {quizzes.length} quizzes
                </span>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Performance */}
      {quizStats.some((s) => s.attempts > 0) && (
        <div>
          <div className="section-head">
            <h2>Performance</h2>
          </div>
          <div className="app-card space-y-4">
            {quizStats
              .filter((s) => s.attempts > 0)
              .map((s) => (
                <div key={s.quiz.id}>
                  <div className="flex items-center justify-between mb-1.5 gap-3">
                    <Link
                      href={`/dashboard/quizzes/${s.quiz.id}`}
                      className="text-xs font-semibold text-[var(--ink)] hover:text-[var(--primary)] no-underline truncate"
                    >
                      {s.quiz.title}
                    </Link>
                    <span className="text-xs font-bold text-[var(--ink)]">{s.avgScore}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${s.avgScore}%` }} />
                  </div>
                  <p className="text-[11px] text-[var(--ink-faint)] mt-1">
                    {s.attempts} attempt{s.attempts !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
