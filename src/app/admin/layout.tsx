"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brain, LogOut } from "lucide-react";
import { isAdmin } from "@/lib/admin";
import { isDemoMode, disableDemoMode } from "@/lib/demo";

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

  useEffect(() => {
    if (isDemoMode() && isAdmin()) {
      setAuthorized(true);
      setLoading(false);
      return;
    }
    router.push("/login");
  }, [router]);

  const handleLogout = () => {
    disableDemoMode();
    router.push("/");
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
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          {/* Logo — fixed left */}
          <Link href="/admin" className="flex items-center gap-2 no-underline shrink-0">
            <Brain className="w-5 h-5 text-white" />
            <span className="text-base font-bold text-white">OLLIN</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-medium ml-1">Admin</span>
          </Link>

          {/* Nav links — centered, takes remaining space */}
          <nav className="flex-1 flex items-center justify-center">
            {adminNav.map((item) => {
              const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2 sm:px-4 py-1 text-xs sm:text-sm font-medium no-underline transition-colors ${
                    isActive ? "text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side — fixed right */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/dashboard" className="text-sm text-white/50 hover:text-white no-underline hidden sm:block">
              Back to app
            </Link>
            <button
              onClick={handleLogout}
              className="text-white/50 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}
