"use client";

import Link from "next/link";
import { BrandMark } from "@/components/Logo";
import { BottomNav } from "@/components/BottomNav";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalUser, disableLocalMode, getUnreadCount, getLocalQuizzes } from "@/lib/local";
import { isAdmin } from "@/lib/admin";
import { useEffect, useState, useRef } from "react";
import { Bell, UserRound } from "lucide-react";
import { warmAll } from "@/lib/prefetch";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [local, setLocal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();
  const profileRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    if (local || isLocalMode()) {
      // Clear the httpOnly session cookie server-side too.
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
      disableLocalMode();
      router.push("/");
      return;
    }
    if (supabase) await supabase.auth.signOut();
    router.push("/");
  };

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
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="avatar-btn"
                  aria-label="Account menu"
                >
                  {userInitial}
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-[var(--card-border)] rounded-2xl shadow-lg py-1.5 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)]">
                      <p className="text-sm font-semibold text-[var(--ink)] truncate">{user.name}</p>
                      <p className="text-[11px] text-[var(--ink-faint)] truncate">{user.email}</p>
                    </div>
                    {[
                      { href: "/dashboard", label: "Home" },
                      { href: "/dashboard/quizzes", label: "My quizzes" },
                      { href: "/dashboard/test-quizzes", label: "Test quizzes" },
                      { href: "/dashboard/attempts", label: "My attempts" },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        replace
                        onClick={() => setProfileOpen(false)}
                        className="block px-4 py-2 text-sm text-[var(--ink-soft)] hover:bg-[var(--surface-2)] no-underline"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <Link
                      href="/dashboard/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--ink-soft)] hover:bg-[var(--surface-2)] no-underline"
                    >
                      <UserRound className="w-4 h-4 text-[var(--primary)]" />
                      My profile
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-[#a32a20] hover:bg-[#fcedec]"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
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
