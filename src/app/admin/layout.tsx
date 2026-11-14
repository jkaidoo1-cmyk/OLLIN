"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { isAdmin, clearStaleAdminSession } from "@/lib/admin";
import { BrandMark, BrandSpinner } from "@/components/Logo";
import { isLocalMode, disableLocalMode, clearLocalUser } from "@/lib/local";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/programs", label: "Programs" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/quizzes", label: "Quizzes" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRealAdmin, setIsRealAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const claimedLocalAdmin = isLocalMode() && isAdmin();

      // The server session is the gate — localStorage alone is never enough.
      // This catches stale browser sessions: localStorage still says admin
      // but the session cookie is missing, expired, or was signed by a
      // different server instance.
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (res.ok && data.user && data.user.role === "admin") {
          if (!data.local) setIsRealAdmin(true);
          setAuthorized(true);
          setLoading(false);
          return;
        }
      } catch { /* network issue — fall through */ }

      // Server rejected the session. If the browser still claims admin, its
      // local session is stale: clear it so the next login is fresh.
      if (claimedLocalAdmin) clearStaleAdminSession();
      else router.push("/login");
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    // The server cookie is the session this app authenticates with, so it is
    // revoked for every kind of admin — a local user key alone would leave a
    // signed-in browser behind.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* offline — nothing else stays behind either */ }
    if (isLocalMode()) disableLocalMode();
    clearLocalUser();
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      // The brand mark doubles as the loading state, so the admin shell waits
      // with the logo spinning rather than a bare word.
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <BrandSpinner className="brand-spinner-lg" />
        <span className="sr-only">Loading the admin panel</span>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[#666] mb-4">Access denied. Admin only.</p>
          <Link href="/login" className="text-sm text-[#006633] font-medium">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="glass-strong sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-14 flex flex-wrap items-center py-1 sm:py-0 sm:h-14">
          {/* Logo — fixed left */}
          <Link href="/admin" className="flex items-center gap-2 no-underline shrink-0">
            <BrandMark />
            <span className="brand-word">Ollin</span>
            <span className="text-[10px] bg-[var(--primary-soft)] border border-[#cfe3d6] px-2 py-0.5 rounded-full text-[var(--primary-strong)] font-semibold ml-1">Admin</span>
          </Link>

          {/* Nav links — full-width scrollable row on mobile, centered on desktop.
              -mx-2 px-2 lets the first/last items align with the header padding
              while the row itself scrolls to reveal the cut-off item. */}
          <nav className="order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:justify-center flex items-center gap-1 overflow-x-auto -mx-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {adminNav.map((item) => {
              const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap no-underline rounded-full transition-colors ${
                    isActive
                      ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Log out — right of logo on mobile row 1, far right on desktop */}
          <div className="flex items-center shrink-0 ml-auto sm:ml-0">
            <button
              onClick={handleLogout}
              className="icon-btn w-auto px-3 gap-1.5"
              aria-label="Log out"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline text-sm font-medium">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
