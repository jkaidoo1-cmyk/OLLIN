"use client";

import { useEffect, useState } from "react";
import { Users, BookOpen, CheckCircle, BarChart3 } from "lucide-react";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState({ totalUsers: 0, totalQuizzes: 0, totalAttempts: 0, publishedQuizzes: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentQuizzes, setRecentQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isDemo = typeof window !== "undefined" && localStorage.getItem("ollin_demo_user") !== null;

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const fetchHeaders: Record<string, string> = isDemo ? { "x-demo-mode": "true" } : {};

      // Fetch all data from APIs (server-side file persistence)
      const [usersRes, quizzesRes] = await Promise.all([
        fetch("/api/admin/users", { headers: fetchHeaders }),
        fetch("/api/quizzes", { headers: fetchHeaders }),
      ]);

      const usersData = await usersRes.json();
      const quizzesData = await quizzesRes.json();

      const users = usersData.users || [];
      const apiQuizzes = quizzesData.quizzes || [];

      // Also get client-side quizzes from localStorage
      let clientQuizzes: any[] = [];
      try {
        const stored = localStorage.getItem("ollin_demo_quizzes");
        clientQuizzes = stored ? JSON.parse(stored) : [];
      } catch { /* ignore */ }

      // Merge: deduplicate by id
      const quizzes = [...apiQuizzes];
      for (const cq of clientQuizzes) {
        if (!quizzes.some((q) => q.id === cq.id)) {
          quizzes.push(cq);
        }
      }

      // Count attempts from server-side file (single source of truth)
      let totalAttempts = 0;
      try {
        const attRes = await fetch(`/api/attempts`);
        if (attRes.ok) {
          const attData = await attRes.json();
          totalAttempts = (attData.attempts || []).length;
        }
      } catch { /* ignore */ }

      setStats({
        totalUsers: users.length,
        totalQuizzes: quizzes.length,
        totalAttempts,
        publishedQuizzes: quizzes.filter((q: any) => q.status === "published").length,
      });
      setRecentUsers(users.slice(0, 5));
      setRecentQuizzes(quizzes.slice(0, 5));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-[#333] mb-6">Admin Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Users", value: stats.totalUsers, icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "Quizzes", value: stats.totalQuizzes, icon: BookOpen, color: "text-green-600 bg-green-50" },
          { label: "Published", value: stats.publishedQuizzes, icon: CheckCircle, color: "text-green-600 bg-green-50" },
          { label: "Attempts", value: stats.totalAttempts, icon: BarChart3, color: "text-purple-600 bg-purple-50" },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-[#e0e0e0] rounded-lg p-4">
            <div className={`w-8 h-8 rounded flex items-center justify-center mb-2 ${item.color}`}>
              <item.icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-[#333]">{item.value}</p>
            <p className="text-xs text-[#999]">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent users */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg">
          <div className="px-4 py-3 border-b border-[#e0e0e0]">
            <h2 className="text-sm font-semibold text-[#333]">Recent users</h2>
          </div>
          <div className="divide-y divide-[#e0e0e0]">
            {recentUsers.map((user: any) => (
              <div key={user.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#333]">{user.full_name}</p>
                  <p className="text-xs text-[#999]">{user.email}</p>
                </div>
                <span className={`badge ${user.role === "admin" ? "badge-danger" : user.role === "host" ? "badge-primary" : "badge-slate"}`}>
                  {user.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent quizzes */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg">
          <div className="px-4 py-3 border-b border-[#e0e0e0]">
            <h2 className="text-sm font-semibold text-[#333]">Recent quizzes</h2>
          </div>
          <div className="divide-y divide-[#e0e0e0]">
            {recentQuizzes.map((quiz: any) => (
              <div key={quiz.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#333]">{quiz.title}</p>
                  <p className="text-xs text-[#999]">{quiz.share_code}</p>
                </div>
                <span className={`badge ${quiz.status === "published" ? "badge-success" : quiz.status === "draft" ? "badge-warning" : "badge-slate"}`}>
                  {quiz.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
