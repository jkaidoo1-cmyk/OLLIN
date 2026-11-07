"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, User, Ticket } from "lucide-react";
import { BrandMark } from "@/components/Logo";
import { isLocalMode, getLocalUser } from "@/lib/local";
import { createClient } from "@/lib/supabase/client";

export default function JoinQuizPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const check = async () => {
      if (isLocalMode()) {
        const user = getLocalUser();
        if (user) {
          setUserName(user.full_name || "User");
          setIsLoggedIn(true);
        }
        return;
      }
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          setUserName(data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User");
          setIsLoggedIn(true);
        }
      }
    };
    check();
  }, [supabase]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    // If not logged in and not a guest yet, require name
    if (!isLoggedIn && !isGuest) {
      if (!userName.trim()) return;
      setIsGuest(true);
    }

    setLoading(true);
    // Pass guest name via URL so the quiz page knows
    const params = new URLSearchParams({ code: code.trim().toUpperCase() });
    if (!isLoggedIn && userName.trim()) {
      params.set("guest", userName.trim());
    }
    router.push(`/quiz/${code.trim().toUpperCase()}?${params.toString()}`);
  };

  const handleCodeInput = (value: string) => {
    const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleaned.length <= 3) {
      setCode(cleaned);
    } else {
      setCode(cleaned.slice(0, 3) + "-" + cleaned.slice(3, 6));
    }
  };

  const isValid = code.length === 7;

  return (
    <div className="min-h-screen">
      <header className="app-topbar">
        <div className="app-column h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </Link>
          {isLoggedIn ? (
            <Link href="/dashboard" className="section-link">Home</Link>
          ) : (
            <Link href="/login" className="section-link">Log in</Link>
          )}
        </div>
      </header>

      <main className="app-column py-6">
        <Link
          href={isLoggedIn ? "/dashboard" : "/"}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] mb-6 no-underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="greeting">Join a quiz</h1>
        <p className="greeting-sub mb-6">
          {isLoggedIn
            ? "Enter the code shared by your classmates."
            : "Enter the quiz code — no account needed."}
        </p>

        <form onSubmit={handleJoin} className="app-card space-y-5">
          {!isLoggedIn ? (
            <div>
              <label htmlFor="guest-name" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
                Your name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)] pointer-events-none" />
                <input
                  id="guest-name"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="input-field pl-10"
                />
              </div>
              <p className="text-[11px] text-[var(--ink-faint)] mt-1.5">
                Your name is only shown for this quiz
              </p>
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-muted)]">
              Joining as <span className="font-semibold text-[var(--ink)]">{userName}</span>
            </p>
          )}

          <div>
            <label htmlFor="quiz-code-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Quiz code
            </label>
            <div className="relative">
              <Ticket className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)] pointer-events-none" />
              <input
                id="quiz-code-input"
                type="text"
                value={code}
                onChange={(e) => handleCodeInput(e.target.value)}
                required
                placeholder="9RX-DHJ"
                maxLength={7}
                className="input-field pl-10 text-center text-xl font-bold tracking-[0.22em] uppercase"
              />
            </div>
          </div>

          <button
            id="join-quiz-btn"
            type="submit"
            disabled={loading || !isValid}
            className="btn-primary w-full"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</>
            ) : "Join quiz"}
          </button>
        </form>

        {!isLoggedIn && (
          <p className="text-center text-xs text-[var(--ink-faint)] mt-5">
            <Link href="/login" className="text-[var(--primary)] font-semibold">Log in</Link> to create quizzes and track your results
          </p>
        )}
      </main>
    </div>
  );
}
