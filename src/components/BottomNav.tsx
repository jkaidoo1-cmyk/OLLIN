"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Home", shape: "dot" },
  { href: "/dashboard/quizzes", label: "Quizzes", shape: "square" },
  { href: "/dashboard/create", label: "", shape: "fab" },
  { href: "/join", label: "Join", shape: "circle" },
  { href: "/dashboard/profile", label: "Profile", shape: "circle" },
] as const;

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

          if (item.shape === "fab") {
            return (
              <div key={item.href} className="nav-fab-slot">
                <Link href={item.href} className="nav-fab" aria-label="Create a quiz">
                  <Plus strokeWidth={2.5} />
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
              <span className={`nav-shape ${item.shape}`} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
