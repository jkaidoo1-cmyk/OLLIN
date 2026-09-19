"use client";

import { useState } from "react";
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
  const router = useRouter();

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
      <header className="bg-[#006633] text-white">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Logo onDark />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
            <h1 className="text-lg font-semibold text-[#333] text-center mb-6">Log in</h1>

            {error && (
              <div className="text-sm px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#333] mb-1">Email</label>
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
                <label className="block text-sm font-medium text-[#333] mb-1">Password</label>
                <div className="relative">
                  <input
                    id="password-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Your password"
                    className="input-field pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#666]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button id="login-submit-btn" type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Logging in...</>
                ) : "Log in"}
              </button>
            </form>
          </div>


        </div>
      </main>
    </div>
  );
}
