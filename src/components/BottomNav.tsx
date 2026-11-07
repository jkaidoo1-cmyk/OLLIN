"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutGrid, LogIn, Plus, UserRound } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/quizzes", label: "Quizzes", icon: LayoutGrid },
  { href: "/dashboard/create", label: "", icon: Plus, fab: true },
  { href: "/join", label: "Join", icon: LogIn },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

/** App bottom navigation: four destinations plus the raised create button. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-inner">
        {items.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          if (item.fab) {
            return (
              <div key={item.href} className="nav-fab-slot">
                <Link href={item.href} className="nav-fab" aria-label="Create a quiz">
                  <Icon strokeWidth={2.5} />
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-dot" aria-hidden />
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
