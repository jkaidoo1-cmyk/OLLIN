"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode, getDemoQuizzes } from "@/lib/demo";
import { Quiz, Course } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import { Plus, Copy, CheckCircle, ExternalLink } from "lucide-react";

export default function MyQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published" | "completed">("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchQuizzes = async () => {
      if (isDemoMode()) {
        setQuizzes(getDemoQuizzes());
        try {
          const res = await fetch("/api/courses", { headers: { "x-demo-mode": "true" } });
          const data = await res.json();
          setCourses(data.courses || []);
        } catch { /* ignore */ }
        setLoading(false);
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) { router.push("/login"); return; }

      const { data } = await supabase
        .from("quizzes").select("*").eq("host_id", user.user.id)
        .order("created_at", { ascending: false });

      if (data) setQuizzes(data);
      // Fetch courses for display
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
      <div className="py-6">
        <div className="h-6 w-32 bg-[#e0e0e0] rounded mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white border border-[#e0e0e0] rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#333]">My quizzes</h1>
        <Link href="/dashboard/create" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New quiz
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        {(["all", "draft", "published", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              filter === f
                ? "bg-[#006633] text-white border-[#006633]"
                : "bg-white text-[#666] border-[#e0e0e0] hover:bg-[#f8f8f8]"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Quiz list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <p className="text-sm text-[#666] mb-4">
            {filter === "all" ? "No quizzes yet." : `No ${filter} quizzes.`}
          </p>
          <Link href="/dashboard/create" className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Create a quiz
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((quiz) => (
            <div key={quiz.id} className="bg-white border border-[#e0e0e0] rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/dashboard/quizzes/${quiz.id}`} className="font-medium text-sm text-[#333] hover:text-[#006633] no-underline">
                      {quiz.title}
                    </Link>
                    <span className={statusStyles[quiz.status] || "badge badge-slate"}>
                      {quiz.status}
                    </span>
                  </div>
                  {quiz.course_id && (
                    <p className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded inline-block mt-1 border border-green-100">
                      {courses.find((c) => c.id === quiz.course_id)?.code || "Course"}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-[#999]">
                    <span>{formatRelativeDate(quiz.created_at)}</span>
                    <button
                      onClick={() => copyShareLink(quiz.share_code, quiz.id)}
                      className="flex items-center gap-1 font-mono text-[#006633]"
                    >
                      {copiedId === quiz.id ? (
                        <><CheckCircle className="w-3 h-3" /> Copied</>
                      ) : (
                        <><Copy className="w-3 h-3" /> {quiz.share_code}</>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link href={`/dashboard/quizzes/${quiz.id}`} className="text-xs text-[#006633] font-medium">
                    Results
                  </Link>
                  {quiz.status === "published" && (
                    <Link href={`/quiz/${quiz.share_code}`} target="_blank" className="text-xs text-[#999]">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
