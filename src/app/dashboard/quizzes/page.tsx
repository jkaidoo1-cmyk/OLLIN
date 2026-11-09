"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalQuizzes } from "@/lib/local";
import { SkeletonText, SkeletonList } from "@/components/Skeleton";
import { QuizViewSwitcher } from "@/components/QuizViewSwitcher";
import { warmResource } from "@/lib/prefetch";
import { Quiz, Course } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import { Plus, Copy, CheckCircle, ExternalLink, Pencil, ClipboardList, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ui/toast";

export default function MyQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published" | "completed">("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const confirmDialog = useConfirm();
  const toast = useToast();

  useEffect(() => {
    const fetchQuizzes = async () => {
      if (isLocalMode()) {
        // Shared with the layout warm-up: usually already resolved, so the
        // page paints with content immediately.
        try {
          const merged = await warmResource("quizzes", async () => {
            const res = await fetch("/api/quizzes", { headers: { "x-local-mode": "true" } });
            if (!res.ok) return getLocalQuizzes();
            const data = await res.json();
            const server: Quiz[] = data.quizzes || [];
            const ids = new Set(server.map((q) => q.id));
            return [...server, ...getLocalQuizzes().filter((q) => !ids.has(q.id))];
          });
          setQuizzes(merged);
        } catch {
          setQuizzes(getLocalQuizzes());
        }
        try {
          const data = await warmResource("courses", async () => {
            const res = await fetch("/api/courses", { headers: { "x-local-mode": "true" } });
            return res.json().catch(() => ({ courses: [] }));
          });
          setCourses(data.courses || []);
        } catch { /* ignore */ }
        setLoading(false);
        return;
      }

      if (!supabase) { setLoading(false); return; }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) { router.push("/login"); return; }

      const { data } = await supabase
        .from("quizzes").select("*").eq("host_id", user.user.id)
        .order("created_at", { ascending: false });

      if (data) setQuizzes(data);
      try {
        const { data: courseData } = await supabase.from("courses").select("*");
        if (courseData) setCourses(courseData);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchQuizzes();
  }, [supabase, router]);

  const copyShareLink = (code: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/quiz/${code}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteQuiz = async (quiz: Quiz) => {
    const ok = await confirmDialog({
      title: `Delete "${quiz.title}"?`,
      body: "This quiz will be removed from your published list and can no longer be joined by students.",
      confirmLabel: "Delete quiz",
      tone: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/quizzes/${quiz.id}`, {
        method: "DELETE",
        headers: isLocalMode() ? { "x-local-mode": "true" } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to delete quiz");
        return;
      }
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
      toast.success(`"${quiz.title}" deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete quiz");
    }
  };

  const filtered = filter === "all" ? quizzes : quizzes.filter((q) => q.status === filter);

  const statusStyles: Record<string, string> = {
    published: "badge badge-success",
    active: "badge badge-primary",
    completed: "badge badge-slate",
    draft: "badge badge-warning",
    archived: "badge badge-slate",
  };

  if (loading) {
    return (
      <div className="pt-3" aria-busy="true">
        <SkeletonText className="h-9 w-40 mb-6" />
        <SkeletonList rows={3} rowClass="h-24" />
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="flex justify-end mb-2">
        <QuizViewSwitcher />
      </div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="greeting">My quizzes</h1>
          <p className="greeting-sub">Everything you have created.</p>
        </div>
        <Link href="/dashboard/create" className="btn-primary text-sm shrink-0">
          <Plus className="w-4 h-4" /> New
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        {(["all", "draft", "published", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip${filter === f ? " active" : ""}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Link href="/dashboard/create" className="list-row app-card no-underline">
          <span className="tile-icon">
            <ClipboardList className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-[var(--ink)]">
              {filter === "all" ? "No quizzes yet" : `No ${filter} quizzes`}
            </span>
            <span className="block text-xs text-[var(--ink-muted)]">Tap + to create your first one</span>
          </span>
        </Link>
      ) : (
        <div className="space-y-3">
          {filtered.map((quiz) => (
            <div key={quiz.id} className="app-card">
              <div className="flex items-start gap-3">
                <span className="tile-icon">
                  <ClipboardList className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/dashboard/quizzes/${quiz.id}`}
                      className="font-bold text-sm text-[var(--ink)] hover:text-[var(--primary)] no-underline"
                    >
                      {quiz.title}
                    </Link>
                    <span className={statusStyles[quiz.status] || "badge badge-slate"}>
                      {quiz.status}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-[var(--ink-faint)]">
                    <span>{formatRelativeDate(quiz.created_at)}</span>
                    <button
                      onClick={() => copyShareLink(quiz.share_code, quiz.id)}
                      className="flex items-center gap-1 font-mono text-[var(--primary)] font-semibold"
                    >
                      {copiedId === quiz.id ? (
                        <><CheckCircle className="w-3 h-3" /> Copied</>
                      ) : (
                        <><Copy className="w-3 h-3" /> {quiz.share_code}</>
                      )}
                    </button>
                    {quiz.course_id && (
                      <span className="text-[var(--primary-strong)] bg-[var(--primary-soft)] px-2 py-0.5 rounded-full">
                        {courses.find((c) => c.id === quiz.course_id)?.code || "Course"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                <Link
                  href={`/dashboard/quizzes/${quiz.id}`}
                  className="text-xs font-semibold text-[var(--primary)]"
                >
                  Results
                </Link>
                <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                <Link
                  href={`/dashboard/create?edit=${quiz.id}`}
                  className="text-xs font-semibold text-[var(--ink-muted)] inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Link>
                {quiz.status === "published" && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                    <Link
                      href={`/quiz/${quiz.share_code}`}
                      target="_blank"
                      className="text-xs font-semibold text-[var(--ink-muted)] inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Open
                    </Link>
                  </>
                )}
                <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                <button
                  type="button"
                  onClick={() => handleDeleteQuiz(quiz)}
                  className="text-xs font-semibold text-red-600 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
