"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { House, LayoutGrid, Plus, ChevronDown, ChevronUp, ClipboardList, BookOpen, History, UserRound } from "lucide-react";

const menuItems = [
  { href: "/dashboard/quizzes", label: "My quizzes", icon: ClipboardList },
  { href: "/dashboard/test-quizzes", label: "Test quizzes", icon: BookOpen },
  { href: "/dashboard/attempts", label: "My attempts", icon: History },
];

const QUIZZES_PATHS = ["/dashboard/quizzes", "/dashboard/test-quizzes", "/dashboard/attempts"];

export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  const selectMenu = (href: string) => {
    setMenuOpen(false);
    window.location.href = href;
  };

  const active = QUIZZES_PATHS.includes(pathname);

  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-inner">
        {[
          { href: "/dashboard", label: "Home", icon: House },
          {
            href: "/dashboard/quizzes",
            label: "Quizzes",
            icon: LayoutGrid,
            dropdown: true,
            active,
            onSelect: openMenu,
          },
          { href: "/dashboard/create", label: "", icon: Plus, fab: true },
          {
            href: "/dashboard/profile",
            label: "Profile",
            icon: UserRound,
            active: pathname === "/dashboard/profile",
          },
        ].map((item) => {
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

          if (item.dropdown) {
            return (
              <div key={item.href} className="relative">
                <button
                  type="button"
                  onClick={item.onSelect || openMenu}
                  onBlur={closeMenu}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  className={`nav-item flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${active ? "text-[#0b5d34] bg-[#e7f2ea]" : "text-[#9aa8a0]"}`}
                >
                  <Icon />
                  <span className="text-[0.64rem] font-semibold">{item.label}</span>
                  {active ? (
                    <ChevronUp className="w-3.5 h-3.5 text-[#9aa8a0]" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#9aa8a0]" />
                  )}
                </button>

                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={closeMenu}
                      aria-hidden="true"
                    />
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0b5d34] text-white rounded-2xl shadow-2xl">
                      <div className="flex flex-col gap-1 px-2">
                        {menuItems.map((m) => (
                          <button
                            key={m.href}
                            type="button"
                            onClick={() => selectMenu(m.href)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[#094b2a] transition-colors"
                          >
                            <m.icon className="w-4 h-4" />
                            <span className="text-sm">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${item.active ? " active" : ""}`}
              aria-current={item.active ? "page" : undefined}
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
