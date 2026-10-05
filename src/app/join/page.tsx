"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, User } from "lucide-react";
import { Logo } from "@/components/Logo";
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
  const canJoin = isLoggedIn || (isGuest && userName.trim()) || (!isLoggedIn && !isGuest);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 no-underline shrink-0">
            <Logo onDark />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>
          <div className="flex-1" />
          {isLoggedIn ? (
            <Link href="/dashboard" className="text-white/70 hover:text-white text-xs font-medium no-underline">
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="text-white/70 hover:text-white text-xs font-medium no-underline">
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="glass-card p-6">
            <h1 className="text-sm font-semibold text-[#1f2937] text-center mb-1">Join a quiz</h1>
            <p className="text-xs text-[#64748b] text-center mb-5">
              {isLoggedIn
                ? "Enter the quiz code shared by your classmates"
                : "Enter the quiz code — no account needed"}
            </p>

            <form onSubmit={handleJoin}>
              {/* Guest name field — only shown when not logged in */}
              {!isLoggedIn && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">Your name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8] pointer-events-none" />
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter your name"
                      className="glass-input py-2.5 pl-10 text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-[#94a3b8] mt-1.5">Your name will only be visible for this quiz</p>
                </div>
              )}

              {isLoggedIn && (
                <p className="text-[10px] text-[#94a3b8] mb-3">
                  Joining as <span className="font-medium text-[#1f2937]">{userName}</span>
                </p>
              )}

              <label className="block text-xs font-medium text-[#475569] mb-1.5">Quiz code</label>
              <input
                id="quiz-code-input"
                type="text"
                value={code}
                onChange={(e) => handleCodeInput(e.target.value)}
                required
                placeholder="e.g. 9RX-DHJ"
                maxLength={7}
                className="w-full text-center text-2xl font-mono font-bold tracking-[0.2em] uppercase glass-input py-3.5 px-3"
              />

              <button id="join-quiz-btn" type="submit" disabled={loading || !isValid} className="glass-btn w-full py-2.5 mt-4">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                ) : "Join quiz"}
              </button>
            </form>
          </div>

          {!isLoggedIn && (
            <p className="text-center text-[10px] text-[#94a3b8] mt-4">
              <Link href="/login" className="text-primary hover:underline">Log in</Link> to create quizzes and track your results
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
