"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isLocalMode, getLocalQuizzes } from "@/lib/local";
import { SkeletonText, SkeletonList } from "@/components/Skeleton";
import { QuizViewSwitcher } from "@/components/QuizViewSwitcher";
import { getResource, invalidateResource } from "@/lib/prefetch";
import { loadMyQuizzes } from "@/lib/quizzes-sync";
import { Quiz, Course } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import { Copy, CheckCircle, ExternalLink, Pencil, ClipboardList, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ui/toast";

export default function MyQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const router = useRouter();
  const confirmDialog = useConfirm();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    const apply = (data: { quizzes: Quiz[]; courses: Course[] }) => {
      if (!alive) return;
      const server: Quiz[] = data.quizzes || [];
      const ids = new Set(server.map((q) => q.id));
      setQuizzes(
        isLocalMode()
          ? [...server, ...getLocalQuizzes().filter((q) => !ids.has(q.id))]
          : server
      );
      setCourses(data.courses || []);
    };

    const load = async () => {
      try {
        const cached = getResource<{ quizzes: Quiz[]; courses: Course[] }>("my-quizzes")?.data;
        if (cached) {
          apply(cached);
          setLoading(false);
        }
        apply(await loadMyQuizzes());
      } catch (error) {
        if (!alive) return;
        setQuizzes(getLocalQuizzes());
        if (error instanceof Error && /sign in/i.test(error.message)) router.push("/login");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [router]);

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
      if (res.status === 404) {
        const { removeLocalQuiz } = await import("@/lib/local");
        removeLocalQuiz(quiz.id);
        setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
        invalidateResource("quizzes");
        invalidateResource("my-quizzes");
        toast.success(`"${quiz.title}" removed from this browser`);
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Failed to delete quiz");
        return;
      }
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
      invalidateResource("quizzes");
      invalidateResource("my-quizzes");
      let stillThere = false;
      try {
        const check = await fetch(`/api/quizzes/${quiz.id}`, { cache: "no-store" });
        stillThere = check.ok;
      } catch {
        /* offline: trust the response */
      }
      if (stillThere) {
        toast.error("The quiz is still on the server — it wasn't deleted. Please try again.");
        return;
      }
      toast.success(`"${quiz.title}" deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete quiz");
    }
  };

    const otherCourse: Course = {
    id: "other",
    code: "—",
    name: "Other",
    description: null,
    department: null,
    program_id: null,
    year: null,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
  const sections: { course: Course; quizzes: Quiz[] }[] = [];
  for (const quiz of filter === "all" ? quizzes : quizzes.filter((q) => q.status === filter)) {
    const course = courses.find((c) => c.id === quiz.course_id);
    if (course) {
      const idx = sections.findIndex((s) => s.course.id === course.id);
      if (idx === -1) sections.push({ course, quizzes: [quiz] });
      else sections[idx].quizzes.push(quiz);
    } else {
      const idx = sections.findIndex((s) => s.course.id === "other");
      if (idx === -1) sections.push({ course: otherCourse, quizzes: [quiz] });
      else sections[idx].quizzes.push(quiz);
    }
  }

  if (loading) {
    return (
      <div className="pt-3" aria-busy="true">
        <SkeletonText className="h-9 w-40 mb-6" />
        <SkeletonList rows={4} rowClass="h-24" />
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="greeting">My quizzes</h1>
          <p className="greeting-sub">All the quizzes you have created, grouped by course.</p>
        </div>
        <QuizViewSwitcher />
      </div>

      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        {(["all", "draft", "published"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip${filter === f ? " active" : ""}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {sections.length === 0 ? (
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
        <div className="space-y-6">
          {sections.map(({ course, quizzes: courseQuizzes }) => (
            <div key={course.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)]" />
                <h2 className="text-sm font-bold text-[var(--ink)]">
                  {course.code} — {course.name}
                </h2>
                {courseQuizzes.length > 1 && (
                  <span className="text-xs text-[var(--ink-faint)]">
                    ({courseQuizzes.length} quiz{courseQuizzes.length === 1 ? "" : "s"})
                  </span>
                )}
              </div>

              {courseQuizzes.map((quiz) => (
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
                        <span className="badge badge-success">
                          {quiz.status}
                        </span>
                        {quiz.course_id && (
                          <span className="text-[var(--primary-strong)] bg-[var(--primary-soft)] px-2 py-0.5 rounded-full">
                            {courses.find((c) => c.id === quiz.course_id)?.code || "Course"}
                          </span>
                        )}
                      </div>
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
                      href={`/dashboard/quizzes/${quiz.id}/edit`}
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
          ))}
        </div>
      )}
    </div>
  );
}
