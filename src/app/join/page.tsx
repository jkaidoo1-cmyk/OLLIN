"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brain, Loader2, User } from "lucide-react";
import { isDemoMode, getDemoUser } from "@/lib/demo";
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
      if (isDemoMode()) {
        const user = getDemoUser();
        if (user) {
          setUserName(user.full_name || "User");
          setIsLoggedIn(true);
        }
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserName(data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User");
        setIsLoggedIn(true);
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
      <header className="bg-[#006633] text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 no-underline shrink-0">
            <Brain className="w-5 h-5 text-white" />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>
          <div className="flex-1" />
          {isLoggedIn ? (
            <Link href="/dashboard" className="text-white/70 hover:text-white text-sm font-medium no-underline">
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="text-white/70 hover:text-white text-sm font-medium no-underline">
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
            <h1 className="text-lg font-semibold text-[#333] text-center mb-2">Join a quiz</h1>
            <p className="text-sm text-[#666] text-center mb-6">
              {isLoggedIn
                ? "Enter the quiz code shared by your classmates"
                : "Enter the quiz code — no account needed"}
            </p>

            <form onSubmit={handleJoin}>
              {/* Guest name field — only shown when not logged in */}
              {!isLoggedIn && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[#333] mb-1.5">Your name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999] pointer-events-none" />
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full border border-[#ccc] rounded py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#006633] focus:shadow-[0_0_0_1px_#006633] transition-colors"
                    />
                  </div>
                  <p className="text-xs text-[#999] mt-1">Your name will only be visible for this quiz</p>
                </div>
              )}

              {isLoggedIn && (
                <p className="text-xs text-[#999] mb-4">
                  Joining as <span className="font-medium text-[#333]">{userName}</span>
                </p>
              )}

              <label className="block text-sm font-medium text-[#333] mb-1.5">Quiz code</label>
              <input
                id="quiz-code-input"
                type="text"
                value={code}
                onChange={(e) => handleCodeInput(e.target.value)}
                required
                placeholder="e.g. 9RX-DHJ"
                maxLength={7}
                className="w-full text-center text-2xl font-mono font-bold tracking-[0.2em] uppercase border border-[#ccc] rounded py-4 px-3 outline-none focus:border-[#006633] focus:shadow-[0_0_0_1px #006633] transition-colors"
              />

              <button id="join-quiz-btn" type="submit" disabled={loading || !isValid} className="btn-primary w-full py-2.5 mt-4">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                ) : "Join quiz"}
              </button>
            </form>
          </div>

          {!isLoggedIn && (
            <p className="text-center text-xs text-[#999] mt-4">
              <Link href="/login" className="text-[#006633] hover:underline">Log in</Link> to create quizzes and track your results
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
