"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { enableLocalMode, type LocalUser } from "@/lib/local";
import { Logo } from "@/components/Logo";
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Logo onDark />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="glass-card p-6">
            <div className="text-center mb-5">
              <h1 className="text-base font-semibold text-[#1f2937] mb-1">Welcome back</h1>
              <p className="text-xs text-[#64748b]">Sign in to your OLLIN account</p>
            </div>

            {error && (
              <div className="text-sm px-3 py-2 bg-red-50/80 border border-red-200/60 text-red-700 rounded-lg mb-4 backdrop-blur-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">Email</label>
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@university.edu"
                  className="glass-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">Password</label>
                <div className="relative">
                  <input
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Your password"
                    className="glass-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569] text-sm"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button id="login-submit-btn" type="submit" disabled={loading} className="glass-btn w-full">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Logging in...</>
                ) : "Log in"}
              </button>
            </form>

            {/* Forgot password — requests land in the admin's inbox */}
            <div className="mt-4">
              {!fpOpen ? (
                <button
                  type="button"
                  onClick={() => { setFpOpen(true); setFpEmail(email); }}
                  className="text-sm text-[#666] hover:text-[#006633] underline"
                >
                  Forgot password?
                </button>
              ) : fpDone ? (
                <div className="glass-card border border-emerald-200/60 p-3 text-sm text-emerald-700">
                  <div className="flex items-center gap-2 mb-0.5">
                    <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                    <span className="font-medium">Request sent</span>
                  </div>
                  <p className="text-xs text-emerald-600/80 mt-1">Ask your admin for the new password.</p>
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
                  className="bg-[#f8f8f8] border border-[#e0e0e0] rounded p-3"
                >
                  <p className="text-xs text-[#666] mb-2">
                    Enter your account email — the admin will be notified to reset your password.
                  </p>
                  {fpError && <p className="text-xs text-red-600/90 mb-1">{fpError}</p>}
                  <input
                    type="email"
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    required
                    placeholder="you@university.edu"
                    className="input-field mb-2"
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={fpSending} className="btn-primary flex-1 py-2 text-sm">
                      {fpSending ? "Sending…" : "Send request"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFpOpen(false); setFpDone(false); setFpError(""); }}
                      className="text-xs text-[#475569] hover:text-[#1f2937] px-3"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}
