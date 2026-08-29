"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { enableDemoMode, authenticateDemoUser } from "@/lib/demo";
import { Brain, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Check demo accounts first
    const demoUser = authenticateDemoUser(email, password);
    if (demoUser) {
      enableDemoMode(demoUser);
      // Add welcome notification
      const { addNotification } = await import("@/lib/demo");
      addNotification(
        "Welcome to OLLIN",
        "Start by creating your first quiz. Upload any study material and let the platform generate questions.",
        "system"
      );
      if (demoUser.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      return;
    }

    // Try Supabase
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleDemo = () => {
    enableDemoMode();
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#006633] text-white">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Brain className="w-5 h-5 text-white" />
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

            <div className="mt-4 pt-4 border-t border-[#e0e0e0]">
              <button
                onClick={handleDemo}
                id="demo-login-btn"
                className="w-full text-sm font-medium text-[#006633] bg-[#e6f0e8] hover:bg-[#d4e8d8] border border-[#b3d9bf] py-2.5 rounded transition-colors"
              >
                Try as student (demo)
              </button>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}
