"use client";

import { useEffect, useState } from "react";
import { Users, BookOpen, CheckCircle, BarChart3, LifeBuoy, Eraser } from "lucide-react";
import { useConfirm, useToast } from "@/components/ui/toast";

export default function AdminOverviewPage() {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [stats, setStats] = useState({ totalUsers: 0, totalQuizzes: 0, totalAttempts: 0, publishedQuizzes: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentQuizzes, setRecentQuizzes] = useState<any[]>([]);
  const [supportMsgs, setSupportMsgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocal = typeof window !== "undefined" && localStorage.getItem("ollin_local_user") !== null;

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const fetchHeaders: Record<string, string> = isLocal ? { "x-local-mode": "true" } : {};

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
        const stored = localStorage.getItem("ollin_local_quizzes");
        clientQuizzes = stored ? JSON.parse(stored) : [];
      } catch { /* ignore */ }

      // Merge: deduplicate by id
      const quizzes = [...apiQuizzes];
      for (const cq of clientQuizzes) {
        if (!quizzes.some((q) => q.id === cq.id)) {
          quizzes.push(cq);
        }
      }

      // Count attempts from server-side file (single source of truth).
      // The admin session cookie satisfies the attempts endpoint's admin
      // requirement for both the all-list and per-quiz reads.
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

      // Support requests — system notifications addressed to admins
      try {
        const supRes = await fetch("/api/notifications");
        if (supRes.ok) {
          const supData = await supRes.json();
          setSupportMsgs(
            (supData.notifications || []).filter((n: any) => n.title?.startsWith("Support:"))
          );
        }
      } catch { /* ignore */ }
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
          { label: "Attempts", value: stats.totalAttempts, icon: BarChart3, color: "text-green-600 bg-green-50" },
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
                <span className={`badge ${user.role === "admin" ? "badge-danger" : "badge-slate"}`}>
                  {user.role === "admin" ? "admin" : "student"}
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

      {/* Support requests */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg mt-6">
        <div className="px-4 py-3 border-b border-[#e0e0e0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-[#333]">Support requests</h2>
          </div>
          {supportMsgs.some((n: any) => !n.read) && (
            <span className="badge badge-warning">{supportMsgs.filter((n: any) => !n.read).length} new</span>
          )}
        </div>
        {supportMsgs.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[#999]">No support messages yet.</div>
        ) : (
          <div className="divide-y divide-[#e0e0e0]">
            {supportMsgs.slice(0, 6).map((n: any) => (
              <SupportMessageCard key={n.id} msg={n} onReplied={fetchOverview} />
            ))}
          </div>
        )}
      </div>

      {/* Maintenance — abandoned attempts cleanup */}
      <AttemptsCleanupCard onPurged={fetchOverview} />
    </div>
  );
}

/**
 * Maintenance: abandoned quiz attempts.
 * A student who opens a quiz and never submits leaves an in_progress row
 * (0%, no answers) behind. After 24h it can never be submitted — the time
 * limit is long gone — so admins can purge these phantoms in one click.
 */
function AttemptsCleanupCard({ onPurged }: { onPurged: () => void }) {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [staleCount, setStaleCount] = useState<number | null>(null);
  const [staleRows, setStaleRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/admin/attempts/cleanup")
      .then((r) => r.json())
      .then((d) => {
        setStaleCount(d.stale_count ?? 0);
        setStaleRows(d.stale || []);
      })
      .catch(() => setStaleCount(null));
  };

  useEffect(() => {
    load();
  }, []);

  const purge = async () => {
    const ok = await confirmDialog({
      title: `Remove ${staleCount} abandoned attempt${staleCount === 1 ? "" : "s"}?`,
      body: "These are unfinished attempts with no answers that expired more than a day ago. Completed attempts are not touched.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/attempts/cleanup", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cleanup failed");
      toast.success(`${data.removed} abandoned attempt${data.removed === 1 ? "" : "s"} removed`);
      load();
      onPurged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  };

  if (staleCount === null) return null; // still loading or endpoint unavailable
  if (staleCount === 0) {
    return (
      <div className="bg-white border border-[#e0e0e0] rounded-lg mt-6 px-4 py-3 flex items-center gap-2">
        <Eraser className="w-4 h-4 text-[#bbb]" />
        <p className="text-xs text-[#999]">No abandoned attempts to clean up.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-amber-200 rounded-lg mt-6">
      <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eraser className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-[#333]">
            Maintenance · {staleCount} abandoned attempt{staleCount === 1 ? "" : "s"}
          </h2>
        </div>
        <button
          onClick={purge}
          disabled={busy}
          className="text-xs px-3 py-2 border border-red-200 text-red-600 rounded hover:bg-red-50 flex-shrink-0 disabled:opacity-50"
        >
          {busy ? "Removing…" : "Clean up"}
        </button>
      </div>
      <div className="divide-y divide-[#f0f0f0] max-h-52 overflow-y-auto">
        {staleRows.map((a) => (
          <div key={a.id} className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-[#333] truncate">{a.participant_name || "Anonymous"}</p>
              <p className="text-xs text-[#999]">
                started {a.started_at ? new Date(a.started_at).toLocaleString() : "unknown"}
              </p>
            </div>
            <span className="badge badge-warning flex-shrink-0">in progress</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One support message with an inline reply box (admin overview). */
function SupportMessageCard({ msg, onReplied }: { msg: any; onReplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const senderKnown = !!(msg.sender_id || msg.sender_email);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setNote(null);
    try {
      const res = await fetch("/api/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: msg.id, reply: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setNote(data.delivered === "in_app" ? "Reply delivered to the student's notifications." : null);
        setText("");
        setOpen(false);
        onReplied();
      } else if (data.contact) {
        setNote(`No in-app account to notify — contact them at ${data.contact}`);
      } else {
        setNote(data.error || "Could not send the reply.");
      }
    } catch {
      setNote("Could not send the reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`px-4 py-3 ${msg.read ? "" : "bg-green-50/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${msg.read ? "text-[#333]" : "font-semibold text-[#333]"}`}>
            {msg.title.replace(/^Support:\s*/, "")}
          </p>
          <p className="text-sm text-[#666] whitespace-pre-line mt-0.5">{msg.message}</p>
          <p className="text-xs text-[#999] mt-1">
            {new Date(msg.created_at).toLocaleString()}
            {senderKnown ? " · can reply in-app" : " · guest — reply via their contact"}
          </p>
          {note && <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2 py-1 mt-1.5">{note}</p>}
          {open && (
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your reply… (delivered to the student's notifications)"
                rows={3}
                className="input-field text-sm resize-y"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={send}
                  disabled={sending || !text.trim()}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? "Sending…" : "Send reply"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 border border-[#e0e0e0] text-xs rounded text-[#666] hover:border-[#ccc]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-2.5 py-1.5 border border-[#e0e0e0] text-[#333] text-xs rounded hover:border-green-400 transition-colors flex items-center gap-1 flex-shrink-0"
          title={senderKnown ? "Reply in-app" : "This guest left no account — reply via contact info"}
        >
          Reply
        </button>
      </div>
    </div>
  );
}
