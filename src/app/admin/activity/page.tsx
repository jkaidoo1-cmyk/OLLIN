"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, UserMinus, BookOpen, GraduationCap, KeyRound, RefreshCcw, Upload, Trash2, FileText, ScrollText as ActivityIcon } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import { useConfirm, useToast } from "@/components/ui/toast";

interface AuditEvent {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string;
  detail: string | null;
  created_at: string;
  at?: string; // file-mode field name
}

const actionIcons: Record<string, typeof ShieldCheck> = {
  "user.create": UserPlus,
  "user.delete": UserMinus,
  "user.update": RefreshCcw,
  "user.bulk_import": Upload,
  "course.create": BookOpen,
  "course.update": BookOpen,
  "course.delete": BookOpen,
  "program.create": GraduationCap,
  "program.update": GraduationCap,
  "program.delete": GraduationCap,
  "key.add": KeyRound,
  "key.remove": KeyRound,
  "key.toggle": KeyRound,
  "key.clear_error": KeyRound,
  "audit.clear": FileText,
  "audit.delete": FileText,
};

const actionColors: Record<string, string> = {
  create: "text-green-600 bg-green-50",
  add: "text-green-600 bg-green-50",
  delete: "text-red-600 bg-red-50",
  remove: "text-red-600 bg-red-50",
  update: "text-blue-600 bg-blue-50",
  toggle: "text-blue-600 bg-blue-50",
};

export default function AdminActivityPage() {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null); // id | "all" | null
  const [error, setError] = useState("");

  const loadEvents = () =>
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

  useEffect(() => {
    loadEvents();
  }, []);

  const deleteEvent = async (id: string) => {
    const ok = await confirmDialog({
      title: "Delete this activity entry?",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/audit?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setEvents(data.events || []);
      toast.success("Entry deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const clearAll = async () => {
    const ok = await confirmDialog({
      title: "Clear the entire activity log?",
      body: "Every recorded event will be permanently removed. This cannot be undone.",
      confirmLabel: "Clear all",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting("all");
    setError("");
    try {
      const res = await fetch("/api/admin/audit?all=true", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clear failed");
      setEvents(data.events || []);
      toast.success("Activity log cleared");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setDeleting(null);
    }
  };

  const formatAction = (action: string) =>
    action
      .split(".")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" · ");

  return (
    <div>
      <PageBanner
        title="Activity"
        subtitle="Record of every administrative change made on the platform"
        icon={<ActivityIcon className="w-5 h-5" />}
        actions={
          events.length > 0 ? (
            <button
              onClick={clearAll}
              disabled={deleting !== null}
              className="text-xs px-3 py-2 bg-white/15 text-white rounded hover:bg-red-500/80 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting === "all" ? "Clearing…" : "Clear all"}
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4 text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <ShieldCheck className="w-8 h-8 text-[#ccc] mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-[#666]">Loading activity…</p>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <ShieldCheck className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">No recorded activity yet.</p>
          <p className="text-xs text-[#999] mt-1">
            Changes you make as admin — creating users, courses, programs, saving quizzes — will be listed here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
          <div className="divide-y divide-[#e0e0e0]">
            {events.map((ev) => {
              const verb = ev.action.split(".")[1] || "";
              const Icon = actionIcons[ev.action] || ShieldCheck;
              const color = actionColors[verb] || "text-[#666] bg-[#f0f0f0]";
              return (
                <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#333]">
                      <span className="font-medium">{formatAction(ev.action)}</span>
                      {ev.detail ? ` — ${ev.detail}` : ""}
                    </p>
                    <p className="text-xs text-[#999] mt-0.5">
                      {ev.actor_email || "system"} · {new Date(ev.created_at || ev.at || "").toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEvent(ev.id)}
                    disabled={deleting !== null}
                    title="Delete this entry"
                    className="p-1.5 rounded text-[#bbb] hover:text-red-600 hover:bg-red-50 flex-shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
