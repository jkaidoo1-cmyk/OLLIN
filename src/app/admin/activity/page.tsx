"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, UserMinus, BookOpen, GraduationCap, KeyRound, RefreshCcw, Upload } from "lucide-react";

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
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatAction = (action: string) =>
    action
      .split(".")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" · ");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#333]">Activity</h1>
        <p className="text-xs text-[#999] mt-0.5">
          Record of every administrative change made on the platform
        </p>
      </div>

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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
