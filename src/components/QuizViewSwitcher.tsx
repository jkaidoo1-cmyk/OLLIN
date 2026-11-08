"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ClipboardList, History } from "lucide-react";

/**
 * Dropdown that switches between the three quiz views:
 * My quizzes, Test quizzes and My attempts.
 *
 * Rendered at the top of each quiz page so the switch is always one tap away
 * (the bottom nav keeps its own copy of the same destinations).
 */
const VIEWS = [
  { href: "/dashboard/quizzes", label: "My quizzes", icon: ClipboardList },
  { href: "/dashboard/test-quizzes", label: "Test quizzes", icon: BookOpen },
  { href: "/dashboard/attempts", label: "My attempts", icon: History },
];

export function QuizViewSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = VIEWS.find((v) => v.href === pathname) || VIEWS[0];
  const CurrentIcon = current.icon;

  // Navigating to another view closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Outside click closes it (mobile tap-away).
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1.5 rounded-full"
      >
        <CurrentIcon className="w-3.5 h-3.5" />
        {current.label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-48 bg-white border border-[var(--card-border)] rounded-2xl shadow-lg py-1.5 z-50 overflow-hidden"
        >
          {VIEWS.map((view) => {
            const Icon = view.icon;
            const active = view.href === pathname;
            return (
              <Link
                key={view.href}
                href={view.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 text-sm no-underline ${
                  active
                    ? "text-[var(--primary)] font-semibold bg-[var(--primary-soft)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {view.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
