"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, ClipboardList, Plus, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/Logo";
import { isLocalMode, getLocalUser } from "@/lib/local";

export default function Home() {
  const [authed, setAuthed] = useState(false);

  // Reflect an existing session so the header doesn't read as logged-out.
  useEffect(() => {
    (async () => {
      if (isLocalMode() && getLocalUser()) {
        setAuthed(true);
        return;
      }
      try {
        const res = await fetch("/api/auth/me");
        setAuthed(res.ok);
      } catch { /* show logged-out header */ }
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="app-topbar">
        <div className="app-column h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link href={authed ? "/dashboard" : "/login"} className="btn-primary text-sm">
              {authed ? "Dashboard" : "Log in"}
            </Link>
          </div>
        </div>
      </header>

      <main className="app-column flex-1 pt-4 pb-16">
        <h1 className="greeting">Turn your notes into a quiz.</h1>
        <p className="greeting-sub">
          Make a quiz, or jump into one with a code.
        </p>

        <div className="join-pill mt-6">
          <input placeholder="Enter quiz code" aria-label="Quiz code" readOnly />
          <Link href="/join" className="join-pill-go">Join</Link>
        </div>

        <div className="hero-card mt-4">
          <h2>Create a new quiz</h2>
          <p>Add questions, set a pass mark and share it in seconds.</p>
          <Link href={authed ? "/dashboard/create" : "/login"} className="hero-btn">
            <Plus className="w-4 h-4" />
            New quiz
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {[
            { value: "3", label: "Steps to publish", dot: "#1f9d63" },
            { value: "1", label: "Code to share", dot: "#3b6fd4" },
            { value: "60s", label: "To set it up", dot: "#e9a13b" },
            { value: "Free", label: "For students", dot: "#1f9d63" },
          ].map((stat) => (
            <div key={stat.label} className="stat-tile">
              <span className="stat-dot" style={{ background: stat.dot }} />
              <p className="stat-value">{stat.value}</p>
              <p className="stat-label">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-7">
          <div className="section-head">
            <h2>How it works</h2>
          </div>
          <div className="list-card">
            {[
              { num: "01", title: "Upload your material", desc: "Paste notes or upload a PDF/DOCX file.", icon: ClipboardList },
              { num: "02", title: "Generate questions", desc: "Review and edit the questions before publishing.", icon: Sparkles },
              { num: "03", title: "Share one code", desc: "Classmates join by code and see their results.", icon: Bell },
            ].map((item) => (
              <div key={item.num} className="list-row">
                <span className="tile-icon">
                  <item.icon className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-[var(--ink)]">{item.title}</span>
                  <span className="block text-xs text-[var(--ink-muted)]">{item.desc}</span>
                </span>
                <span className="text-[11px] font-bold text-[var(--ink-faint)]">{item.num}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Link href={authed ? "/dashboard" : "/login"} className="btn-primary w-full">
            {authed ? "Go to dashboard" : "Get started"}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/join" className="btn-ghost w-full">
            Join a quiz instead
          </Link>
        </div>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="app-column py-6">
          <div className="flex items-center gap-2 mb-3">
            <BrandMark />
            <span className="brand-word text-base">Ollin</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] no-underline">Dashboard</Link>
            <Link href="/join" className="hover:text-[var(--ink)] no-underline">Join a quiz</Link>
            <Link href="/support" className="hover:text-[var(--ink)] no-underline">Help &amp; support</Link>
          </div>
          <p className="text-[11px] text-[var(--ink-faint)] mt-4">
            &copy; {new Date().getFullYear()} Ollin. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
