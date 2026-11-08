"use client";

import Link from "next/link";
import { BrandMark } from "@/components/Logo";
import { BottomNav } from "@/components/BottomNav";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalUser, getUnreadCount, getLocalQuizzes } from "@/lib/local";
import { isAdmin } from "@/lib/admin";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { warmAll } from "@/lib/prefetch";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [local, setLocal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    // The quiz edit page is the one dashboard route admins may use —
    // it's how they edit quizzes from the admin Quizzes list.
    const isEditPage = typeof window !== "undefined" && window.location.search.includes("edit=");
    const getUser = async () => {
      if (isLocalMode()) {
        const localUser = getLocalUser();
        if (localUser) {
          // Admins administrate — they don't use the student dashboard.
          // (Exception: the quiz edit page, reached from the admin panel.)
          if (isAdmin() && !isEditPage) {
            router.replace("/admin");
            return;
          }
          setUser({ email: localUser.email, name: localUser.full_name });
          // Show a storage notice only when the server is NOT persisting to
          // Supabase — a healthy server session is not a local.
          try {
            const res = await fetch("/api/backend-status");
            const data = await res.json();
            if (data.backend !== "supabase") setLocal(true);
          } catch { /* assume server fine */ }
          return;
        }
      }

      // Use the app's session cookie (works in both local and Supabase mode).
      try {
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();
        if (meRes.ok && meData.user) {
          // Admins go to the admin console (except on the quiz edit page).
          if (meData.user.role === "admin" && !isEditPage) {
            router.replace("/admin");
            return;
          }
          setUser({ email: meData.user.email || "", name: meData.user.full_name || meData.user.email?.split("@")[0] || "User" });
          return;
        }
      } catch { /* fall through */ }
      if (!supabase) { router.push("/login"); return; }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUser({
        email: data.user.email || "",
        name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User",
      });
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
      ["quizzes", async () => {
        try {
          const res = await fetch("/api/quizzes", { headers: { "x-local-mode": "true" } });
          if (!res.ok) return getLocalQuizzes();
          const data = await res.json();
          const server: { id: string }[] = data.quizzes || [];
          const ids = new Set(server.map((q) => q.id));
          return [...server, ...getLocalQuizzes().filter((q) => !ids.has(q.id))];
        } catch { return getLocalQuizzes(); }
      }],
      ["courses", async () => {
        try {
          const res = await fetch("/api/courses", { headers: { "x-local-mode": "true" } });
          const data = await res.json();
          return data.courses || [];
        } catch { return []; }
      }],
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

  const userInitial = user?.name?.charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen">
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

            {user && (
              <span
                className="avatar-btn"
                title={`${user.name} · ${user.email}`}
                aria-label={`Signed in as ${user.name}`}
              >
                {userInitial}
              </span>
            )}
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
