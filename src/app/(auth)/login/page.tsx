"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { enableLocalMode } from "@/lib/local";
import { BrandMark } from "@/components/Logo";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fpOpen, setFpOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpSending, setFpSending] = useState(false);
  const [fpDone, setFpDone] = useState(false);
  const [fpError, setFpError] = useState("");
  const router = useRouter();

  // Redirected here after a dead session (clearStaleAdminSession).
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("expired=1")) {
      setError("Your session has expired. Please log in again.");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Authenticate through the server: it checks the local users file
      // (accounts created by an admin work from any browser), then Supabase.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.user) {
        setError(data.error || "Invalid email or password.");
        setLoading(false);
        return;
      }

      if (data.local) {
        enableLocalMode(data.user);
        if (data.user.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
        return;
      }

      // Real Supabase session (cookie set by the API route)
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="app-topbar">
        <div className="app-column h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </Link>
          <Link href="/join" className="section-link">Join a quiz</Link>
        </div>
      </header>

      <main className="app-column py-8">
        <h1 className="greeting">Welcome back</h1>
        <p className="greeting-sub mb-6">Sign in to your Ollin account.</p>

        {error && (
          <div className="text-sm px-4 py-3 bg-[#fcedec] border border-[#f3d2ce] text-[#a32a20] rounded-2xl mb-5">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Email
            </label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@university.edu"
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="password-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
                className="input-field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button id="login-submit-btn" type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Logging in…</>
            ) : "Log in"}
          </button>
        </form>

        {/* Forgot password — requests land in the admin's inbox */}
        <div className="mt-5">
          {!fpOpen ? (
            <button
              type="button"
              onClick={() => { setFpOpen(true); setFpEmail(email); }}
              className="text-sm text-[var(--ink-muted)] hover:text-[var(--primary)]"
            >
              Forgot password?
            </button>
          ) : fpDone ? (
            <div className="app-card border-[#cbe8d6] text-sm text-[#116b3c]">
              <div className="flex items-center gap-2 mb-0.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                <span className="font-semibold">Request sent</span>
              </div>
              <p className="text-xs opacity-80 mt-1">Ask your admin for the new password.</p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (fpSending) return;
                setFpSending(true);
                setFpError("");
                try {
                  const res = await fetch("/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: fpEmail }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) setFpError(data.error || "Could not send. Try again.");
                  else setFpDone(true);
                } catch {
                  setFpError("Could not reach the server. Try again.");
                } finally {
                  setFpSending(false);
                }
              }}
              className="app-card space-y-3"
            >
              <p className="text-xs text-[var(--ink-muted)]">
                Enter your account email — the admin will be notified to reset your password.
              </p>
              {fpError && <p className="text-xs text-[#a32a20]">{fpError}</p>}
              <input
                type="email"
                value={fpEmail}
                onChange={(e) => setFpEmail(e.target.value)}
                required
                placeholder="you@university.edu"
                className="input-field"
              />
              <div className="flex items-center gap-3">
                <button type="submit" disabled={fpSending} className="btn-primary flex-1">
                  {fpSending ? "Sending…" : "Send request"}
                </button>
                <button
                  type="button"
                  onClick={() => { setFpOpen(false); setFpDone(false); setFpError(""); }}
                  className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] px-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
