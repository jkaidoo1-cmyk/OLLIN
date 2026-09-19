"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { isAdmin } from "@/lib/admin";
import { Logo } from "@/components/Logo";
import { isLocalMode, disableLocalMode } from "@/lib/local";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/programs", label: "Programs" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/quizzes", label: "Quizzes" },
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
      // Local admin session
      if (isLocalMode() && isAdmin()) {
        setAuthorized(true);
        setLoading(false);
        return;
      }

      // Real (Supabase) admin session
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (res.ok && data.user && data.user.role === "admin") {
          setIsRealAdmin(true);
          setAuthorized(true);
          setLoading(false);
          return;
        }
      } catch { /* not authenticated */ }

      router.push("/login");
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    if (isLocalMode()) {
      disableLocalMode();
      router.push("/");
      return;
    }
    if (isRealAdmin) {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch { /* ignore */ }
    }
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-[#666]">Loading...</div>
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
      <header className="bg-[#006633] text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-14 flex flex-wrap items-center py-1 sm:py-0 sm:h-14">
          {/* Logo — fixed left */}
          <Link href="/admin" className="flex items-center gap-1 no-underline shrink-0">
            <Logo onDark />
            <span className="text-base font-bold text-white">OLLIN</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-medium ml-1">Admin</span>
          </Link>

          {/* Right side — pushed right on row 1 (mobile) / far right (desktop) */}
          <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
            <Link href="/dashboard" className="text-sm text-white/50 hover:text-white no-underline hidden sm:block">
              Back to app
            </Link>
            <button
              onClick={handleLogout}
              className="text-white/50 hover:text-white transition-colors"
              aria-label="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Nav links — full-width scrollable row on mobile, centered on desktop */}
          <nav className="order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:justify-center flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {adminNav.map((item) => {
              const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2 sm:px-4 py-1 text-xs sm:text-sm font-medium whitespace-nowrap no-underline transition-colors ${
                    isActive ? "text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
