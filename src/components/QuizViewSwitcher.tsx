"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Segmented switch between the three quiz views:
 * My quizzes, Test quizzes and My attempts.
 *
 * All three destinations stay visible as buttons so the user never has to
 * open a menu to discover where they can go. Rendered at the top of each quiz
 * page (the bottom nav keeps its own copy of the same destinations).
 */
const VIEWS = [
  { href: "/dashboard/quizzes", label: "My quizzes" },
  { href: "/dashboard/test-quizzes", label: "Test quizzes" },
  { href: "/dashboard/attempts", label: "My attempts" },
];

export function QuizViewSwitcher() {
  const pathname = usePathname();

  return (
    <nav aria-label="Quiz views" className="grid grid-cols-3 gap-2">
      {VIEWS.map((view) => {
        const active = view.href === pathname;
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-center rounded-full border px-2 py-2 text-xs font-semibold no-underline transition-colors ${
              active
                ? "bg-[var(--primary-soft)] border-[#cfe6d8] text-[var(--primary-strong)]"
                : "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
