"use client";

import Link from "next/link";
import { BrandMark } from "@/components/Logo";
import { BottomNav } from "@/components/BottomNav";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalUser, getUnreadCount } from "@/lib/local";
import { isAdmin } from "@/lib/admin";
import { useEffect, useState } from "react";
import { Bell, WifiOff } from "lucide-react";
import { warmAll, warmResource } from "@/lib/prefetch";
import { loadMyQuizzes, loadQuizzes } from "@/lib/quizzes-sync";
import { warmOfflinePages } from "@/lib/offline";
import { useOffline } from "@/lib/use-offline";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [local, setLocal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const offline = useOffline();
  const supabase = createClient();

  useEffect(() => {
    // Two dashboard routes are legitimately used by admins: the quiz edit page
    // (reached from the admin Quizzes list) and their own profile — the only
    // screen with password change and preferences. Redirecting off the profile
    // left admin accounts no way to change their password at all.
    const isEditPage = typeof window !== "undefined" && window.location.search.includes("edit=");
    const adminMayStay = isEditPage || pathname === "/dashboard/profile";
    const getUser = async () => {
      if (isLocalMode()) {
        const localUser = getLocalUser();
        if (localUser) {
          // Admins administrate — they don't use the student dashboard.
          // (Exception: the quiz edit page, reached from the admin panel.)
          if (isAdmin() && !adminMayStay) {
            router.replace("/admin");
            return;
          }
          // Show a storage notice only when the server is NOT persisting to a
          // shared database — a healthy server session is not a local.
          try {
            const res = await fetch("/api/backend-status");
            const data = await res.json();
            if (data.persistent === false) setLocal(true);
          } catch { /* assume server fine */ }
          return;
        }
      }

      // Use the app's session cookie (works in both local and Supabase mode).
      try {
        // Shared with the dashboard page, which needs the same answer — one
        // request per page load instead of two 1-2s round trips.
        const meData = await warmResource<{ ok: boolean; user?: any }>("me", async () => {
          const res = await fetch("/api/auth/me");
          const data = await res.json().catch(() => ({}));
          return { ok: res.ok, ...data };
        });
        if (meData?.ok && meData.user) {
          // Admins go to the admin console (except on the quiz edit page).
          if (meData.user.role === "admin" && !adminMayStay) {
            router.replace("/admin");
            return;
          }
          return;
        }
      } catch { /* fall through */ }
      if (!supabase) { router.push("/login"); return; }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
    };
    getUser();
  }, [supabase, router]);

  useEffect(() => {
    const refresh = () => {
      if (!isLocalMode()) return;
      getUnreadCount().then(setUnreadCount).catch(() => {});
    };
    refresh();
    window.addEventListener("notifications-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("notifications-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname]);

  // Warm page data while the student is still on the current page, so
  // navigating to any dashboard page renders content on first paint.
  useEffect(() => {
    warmAll([
      // Quiz lists warm through the delta loaders, so the refreshed copy is a
      // small difference rather than the whole catalogue.
      ["quizzes", loadQuizzes],
      ["courses", async () => {
        try {
          const res = await fetch("/api/courses", { headers: { "x-local-mode": "true" } });
          const data = await res.json();
          return data.courses || [];
        } catch { return []; }
      }],
      ["my-quizzes", loadMyQuizzes],
      ["my-attempts", async () => {
        try {
          const res = await fetch("/api/attempts?mine=true");
          if (!res.ok) return [];
          const data = await res.json();
          return data.attempts || [];
        } catch { return []; }
      }],
      ["saved-quizzes", async () => {
        try {
          const res = await fetch("/api/saved-quizzes");
          const data = await res.json();
          return data.saved || [];
        } catch { return []; }
      }],
    ]);
  }, []);

  // Offline copies of the quiz views. The worker fetches them with this
  // session's cookies, so no private page is ever stored at install time.
  // Re-warmed whenever the connection comes back.
  useEffect(() => {
    warmOfflinePages();
    window.addEventListener("online", warmOfflinePages);
    return () => window.removeEventListener("online", warmOfflinePages);
  }, []);

  return (
    <div className="min-h-screen">
      {offline && (
        <div
          role="status"
          className="bg-[#fdf4e3] text-[#7a4b00] text-center py-1 px-3 text-[11px] font-medium flex items-center justify-center gap-1.5"
        >
          <WifiOff className="w-3 h-3 shrink-0" />
          Offline — showing saved quizzes and attempts. New quizzes need a connection.
        </div>
      )}

      {local && (
        <div className="bg-[#0b5d34] text-white/90 text-center py-1 text-[11px] font-medium">
          Limited storage — data is saved on this server only and may not persist
        </div>
      )}

      <header className="app-topbar">
        <div className="app-column h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 no-underline">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href="/dashboard/notifications"
              replace
              className="icon-btn relative"
              aria-label="Notifications"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#ef4444] rounded-full ring-2 ring-white" />
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="app-column pt-2 pb-32">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
