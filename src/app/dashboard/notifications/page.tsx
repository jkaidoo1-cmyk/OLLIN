"use client";

import { useEffect, useState } from "react";
import {
  getDemoNotifications,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  Notification,
} from "@/lib/demo";
import { Bell, BookOpen, BarChart3, Info, Trash2, X } from "lucide-react";

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
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    setNotifications(getDemoNotifications());
  }, []);

  const markAllRead = () => {
    markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleDelete = (id: string) => {
    deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearAll = () => {
    clearAllNotifications();
    setNotifications([]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#333]">Notifications</h1>
        <div className="flex items-center gap-3">
          {notifications.some((n) => !n.read) && (
            <button onClick={markAllRead} className="text-sm text-[#006633] hover:text-[#005528] font-medium">
              Mark all as read
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={handleClearAll} className="text-sm text-red-500 hover:text-red-700 font-medium">
              Clear all
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <Bell className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
          <div className="divide-y divide-[#e0e0e0]">
            {notifications.map((notif) => {
              const Icon = typeIcons[notif.type] || Bell;
              return (
                <div
                  key={notif.id}
                  className={`px-4 py-3 flex items-start gap-3 ${
                    !notif.read ? "bg-[#f8fdf8]" : ""
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${typeColors[notif.type]}`}>
                    <Icon className="w-4 h-4" />
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
