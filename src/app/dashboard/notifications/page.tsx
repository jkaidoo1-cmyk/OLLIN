"use client";

import { useEffect, useState } from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  Notification,
} from "@/lib/local";
import { useResource } from "@/lib/prefetch";
import { Bell, BookOpen, BarChart3, Info, Trash2, X } from "lucide-react";
import { SkeletonPanel } from "@/components/Skeleton";

const typeIcons: Record<string, typeof Bell> = {
  quiz: BookOpen,
  result: BarChart3,
  system: Info,
};

const typeColors: Record<string, string> = {
  quiz: "text-blue-600 bg-blue-50",
  result: "text-green-600 bg-green-50",
  system: "text-[#666] bg-[#f0f0f0]",
};

export default function NotificationsPage() {
  // First paint reads the warmed cache; the "notifications-updated" event
  // (marks, deletes, admin replies) re-fetches fresh.
  const { data: warmed, loading: warmLoading, reload } = useResource("notifications", getNotifications);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => reload();

  useEffect(() => {
    if (warmLoading) return;
    setNotifications(warmed || []);
    setLoading(false);
  }, [warmed, warmLoading]);

  useEffect(() => {
    window.addEventListener("notifications-updated", load);
    return () => window.removeEventListener("notifications-updated", load);
  }, []);

  const markAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearAll = async () => {
    await clearAllNotifications();
    setNotifications([]);
  };




  return (
    <div className="pt-2">
      <div className="mb-5">
        <h1 className="greeting">Notifications</h1>
        <p className="greeting-sub">Updates on your quizzes and results.</p>
      </div>
      {notifications.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          {notifications.some((n) => !n.read) && (
            <button onClick={markAllRead} className="chip">
              Mark all read
            </button>
          )}
          <button onClick={handleClearAll} className="chip">
            Clear all
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonPanel rows={3} />
      ) : notifications.length === 0 ? (
        <div className="app-card py-12 text-center">
          <span className="tile-icon mx-auto mb-3">
            <Bell className="w-5 h-5" />
          </span>
          <p className="text-sm font-bold text-[var(--ink)]">No notifications yet</p>
          <p className="text-xs text-[var(--ink-muted)] mt-1">New quiz and result updates show up here.</p>
        </div>
      ) : (
        <div className="list-card">
          <div className="divide-y divide-[#e0e0e0]">
            {notifications.map((notif) => {
              const Icon = typeIcons[notif.type] || Bell;
              return (
                <div
                  key={notif.id}
                  className={`px-4 py-3.5 flex items-start gap-3 ${
                    !notif.read ? "bg-[#f8fdf8]" : ""
                  }`}
                >
                  <div className={`w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0 mt-0.5 ${typeColors[notif.type]}`}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium text-[#333] ${!notif.read ? "font-semibold" : ""}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-[#006633] flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-[#666] mt-0.5">{notif.message}</p>
                    <p className="text-xs text-[#999] mt-1">
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="p-1 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors flex-shrink-0"
                    title="Delete notification"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
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
