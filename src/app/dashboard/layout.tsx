"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalUser, disableLocalMode, getUnreadCount } from "@/lib/local";
import { isAdmin } from "@/lib/admin";
import type { LocalUser } from "@/lib/local";
import { useEffect, useState, useRef } from "react";
import { LogOut, Bell, ShieldCheck, LifeBuoy } from "lucide-react";

const pageLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/create": "Create quiz",
  "/dashboard/quizzes": "My quizzes",
  "/dashboard/test-quizzes": "Test quizzes",
  "/join": "Join quiz",
  "/dashboard/notifications": "Notifications",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [local, setLocal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentYear, setCurrentYear] = useState<number>(1);
  const supabase = createClient();
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const getUser = async () => {
      if (isLocalMode()) {
        const localUser = getLocalUser();
        if (localUser) {
          // Admins administrate — they don't use the student dashboard.
          if (isAdmin()) {
            router.replace("/admin");
            return;
          }
          setUser({ email: localUser.email, name: localUser.full_name });
          setCurrentYear(localUser.current_year || 1);
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

      if (!supabase) { router.push("/login"); return; }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      // Supabase admins also belong in the admin console.
      try {
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();
        if (meRes.ok && meData.user?.role === "admin") {
          router.replace("/admin");
          return;
        }
      } catch { /* fall through to student view */ }
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
    if (local) {
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

  const currentPage = pageLabels[pathname] || "Dashboard";

  return (
    <div className="min-h-screen">
      {local && (
        <div className="bg-[#005528] text-white text-center py-1 text-xs font-medium">
          Limited storage — data is saved on this server only and may not persist
        </div>
      )}

      <header className="bg-[#006633] text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          {/* Logo + current page — left side */}
          <Link href="/" className="flex items-center gap-1 no-underline shrink-0">
            <Logo onDark />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>
          <span className="text-white/70 text-sm font-medium ml-2 sm:ml-3 truncate">/ {currentPage}</span>

          {/* Spacer */}
          <nav className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/dashboard/notifications" replace className="text-white/60 hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Link>

            {/* Avatar with dropdown */}
            {user && (
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm font-bold text-[#006633] hover:opacity-90 transition-opacity"
                >
                  {userInitial}
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 z-50">
                    <div className="px-4 py-3 border-b border-[#e0e0e0]">
                      <p className="text-sm font-medium text-[#333] truncate">{user.name}</p>
                      <p className="text-xs text-[#999] truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/dashboard"
                      replace
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard/create"
                      replace
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      Create quiz
                    </Link>
                    <Link
                      href="/dashboard/quizzes"
                      replace
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      My quizzes
                    </Link>
                    <Link
                      href="/join"
                      replace
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      Join quiz
                    </Link>
                    <Link
                      href="/dashboard/test-quizzes"
                      replace
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      Test quizzes
                    </Link>
                    <Link
                      href="/dashboard/attempts"
                      replace
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      My attempts
                    </Link>
                    <Link
                      href="/support?from=dashboard"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] no-underline"
                    >
                      <LifeBuoy className="w-4 h-4 text-[#006633]" />
                      Help &amp; support
                    </Link>
                    {local && (
                      <div className="border-t border-[#e0e0e0] mt-1 pt-2 px-4 pb-1">
                        <label className="block text-[10px] font-medium text-[#999] uppercase tracking-wider mb-1">My year</label>
                        <select
                          value={currentYear}
                          onChange={async (e) => {
                            const y = Number(e.target.value);
                            setCurrentYear(y);
                            // Persist server-side so the year applies on any device
                            try {
                              await fetch("/api/auth/profile", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ current_year: y }),
                              });
                            } catch { /* non-critical */ }
                            // Mirror locally so course filtering updates instantly
                            const u = getLocalUser();
                            if (u) {
                              u.current_year = y;
                              localStorage.setItem("ollin_local_user", JSON.stringify(u));
                            }
                          }}
                          className="w-full text-sm border border-[#e0e0e0] rounded px-2 py-1.5 text-[#333] bg-white"
                        >
                          <option value={1}>Year 1</option>
                          <option value={2}>Year 2</option>
                          <option value={3}>Year 3</option>
                          <option value={4}>Year 4</option>
                        </select>
                      </div>
                    )}
                    <div className="border-t border-[#e0e0e0] mt-1 pt-1">
                      <button
                        onClick={async () => {
                          setProfileOpen(false);
                          // Revoke every session for this account, then log out here too.
                          try { await fetch("/api/auth/sessions", { method: "POST" }); } catch { /* ignore */ }
                          handleLogout();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-[#333] hover:bg-[#f8f8f8] flex items-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Log out everywhere
                      </button>
                      <button
                        onClick={() => { setProfileOpen(false); handleLogout(); }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}
