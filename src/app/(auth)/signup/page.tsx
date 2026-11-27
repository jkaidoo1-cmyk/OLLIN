"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { enableLocalMode } from "@/lib/local";
import { clearResourceCache } from "@/lib/prefetch";
import { clearOfflineData } from "@/lib/offline";
import { BrandMark, BrandSpinner } from "@/components/Logo";
import { Eye, EyeOff } from "lucide-react";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, passwordProblem } from "@/lib/password-policy";
import { usePendingAction } from "@/lib/use-pending-action";

interface SignupProgram {
  id: string;
  code?: string;
  name?: string;
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Which programme (course) the student is on, and their class year. Both
  // decide what the dashboard shows them, so they are asked for up front.
  const [programs, setPrograms] = useState<SignupProgram[]>([]);
  const [programsLoaded, setProgramsLoaded] = useState(false);
  const [programId, setProgramId] = useState("");
  const [year, setYear] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  // One click, one account. The lock is a ref flipped before the first await,
  // so a double tap can never POST twice (which would answer "email taken").
  const { pending: loading, begin, end } = usePendingAction();
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/programs");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPrograms(Array.isArray(data.programs) ? data.programs : []);
      } catch { /* the form still works without the list */ }
      finally { if (!cancelled) setProgramsLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const weakPassword = passwordProblem(password, email);
    if (weakPassword) {
      setError(weakPassword);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!begin()) return;

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          program_id: programId || null,
          current_year: year,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.user) {
        setError(data.error || "Could not create your account.");
        end();
        return;
      }

      // Same cache reset as login: resource caches are per origin, not per user.
      clearResourceCache();
      void clearOfflineData();
      if (data.local) enableLocalMode(data.user);

      router.push(data.user.role === "admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
      end();
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
          <Link href="/login" className="section-link">
            Log in
          </Link>
        </div>
      </header>

      <main className="app-column py-8">
        <h1 className="greeting">Create your account</h1>
        <p className="greeting-sub mb-6">Sign up to get access to quizzes.</p>

        {error && (
          <div className="text-sm px-4 py-3 bg-[#fcedec] border border-[#f3d2ce] text-[#a32a20] rounded-2xl mb-5">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="name-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Full name
            </label>
            <input
              id="name-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="signup-email-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Email
            </label>
            <input
              id="signup-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@university.edu"
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="signup-password-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="signup-password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
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
            <p className="text-[11px] text-[var(--ink-faint)] mt-1.5">{PASSWORD_HINT}</p>
          </div>

          <div>
            <label htmlFor="signup-confirm-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Confirm password
            </label>
            <input
              id="signup-confirm-input"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Repeat your password"
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="signup-program-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Course / programme
            </label>
            <select
              id="signup-program-input"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="input-field"
              disabled={!programsLoaded || programs.length === 0}
            >
              <option value="">
                {!programsLoaded
                  ? "Loading programmes…"
                  : programs.length === 0
                  ? "No programmes added yet"
                  : "Choose your programme"}
              </option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} — ${p.name || ""}` : p.name || p.id}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--ink-faint)] mt-1.5">
              {programsLoaded && programs.length === 0
                ? "Your administrator hasn't added programmes yet — you can choose yours later in Profile."
                : "Decides which courses you see. You can change it later in Profile."}
            </p>
          </div>

          <div>
            <label htmlFor="signup-year-input" className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
              Class year
            </label>
            <select
              id="signup-year-input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input-field"
            >
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </select>
          </div>

          <button id="signup-submit-btn" type="submit" disabled={loading} data-pending={loading || undefined} className="btn-primary w-full">
            {loading ? (
              <><BrandSpinner className="w-4 h-4" /> Creating account…</>
            ) : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--ink-faint)] mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--primary)] font-semibold">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
