"use client";

import { useEffect, useState } from "react";
import { AtSign, ChevronDown, ChevronRight, Download, Eye, EyeOff, GraduationCap, KeyRound, LifeBuoy, Loader2, LogOut, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { isLocalMode, disableLocalMode } from "@/lib/local";
import { createClient } from "@/lib/supabase/client";

/**
 * Student profile — settings-list layout.
 *
 * A green identity banner up top, then everything else is a calm
 * settings list: each row shows its current value and only expands
 * into an editor when tapped (progressive disclosure), so the page
 * reads at a glance instead of showing every form at once.
 */

interface Me {
  id: string;
  email: string;
  full_name: string;
  role: string;
  program_id?: string | null;
  current_year?: number | null;
}

type OpenSection = "year" | "password" | "install" | null;

/** Chrome/Edge fire beforeinstallprompt with this shape; lib.dom doesn't declare it. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)); // iPadOS 13+

export default function ProfilePage() {
  const toast = useToast();
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<OpenSection>(null);

  const [savingYear, setSavingYear] = useState(false);
  const [savedYearFlash, setSavedYearFlash] = useState<number | null>(null);

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // PWA install
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDone, setInstallDone] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep our in-app entry point as the only trigger
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstallDone(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setMe(data.user);
        }
      } catch { /* page shows signed-out state */ }
      finally { setLoading(false); }
    })();
  }, []);

  const syncLocalMirror = (patch: Partial<{ full_name: string; current_year: number }>) => {
    try {
      const raw = localStorage.getItem("ollin_local_user");
      if (raw) {
        const u = JSON.parse(raw);
        Object.assign(u, patch);
        localStorage.setItem("ollin_local_user", JSON.stringify(u));
      }
    } catch { /* mirror is optional */ }
  };

  const saveYear = async (y: number) => {
    if (!me || y === me.current_year) { setOpen(null); return; }
    setSavingYear(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_year: y }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMe((m) => (m ? { ...m, current_year: y } : m));
        syncLocalMirror({ current_year: y });
        setSavedYearFlash(y);
        setTimeout(() => setSavedYearFlash(null), 1800);
        setOpen(null);
        toast.success(`Year ${y} — your courses will update`);
      } else {
        toast.error(data.error || "Could not update year");
      }
    } catch {
      toast.error("Could not update year. Check your connection.");
    } finally {
      setSavingYear(false);
    }
  };

  const handleLogout = async () => {
    if (isLocalMode()) {
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
      disableLocalMode();
      router.push("/");
      return;
    }
    if (supabase) await supabase.auth.signOut();
    router.push("/");
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPw) return;
    if (newPw.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Password changed");
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
        setOpen(null);
      } else {
        toast.error(data.error || "Could not change password");
      }
    } catch {
      toast.error("Could not change password. Check your connection.");
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <Loader2 className="w-8 h-8 text-[#ccc] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#666]">Loading…</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <UserRound className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">You need to be logged in to view your profile.</p>
        </div>
      </div>
    );
  }

  const handleInstall = async () => {
    if (installDone || window.matchMedia("(display-mode: standalone)").matches) return;
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") setInstallDone(true);
      setInstallEvent(null); // the prompt can only fire once
    }
  };

  const initial = (me.full_name || me.email).charAt(0).toUpperCase();
  const year = me.current_year || 1;
  const pwLen = newPw.length;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;
  const pwLabel = ["", "Too short — 6 minimum", "Decent", "Strong password"][pwScore];
  const pwColor = ["bg-[#e0e0e0]", "bg-red-400", "bg-amber-400", "bg-green-500"][pwScore];
  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* ── Identity banner ── */}
      <div className="bg-[#006633] rounded-lg p-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" aria-hidden />
        <div className="absolute -bottom-14 -left-6 w-36 h-36 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-2xl font-bold text-[#006633] shrink-0 shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-white truncate">{me.full_name || "Student"}</h1>
            <p className="text-sm text-white/70 truncate">{me.email}</p>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-1.5 mt-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-white text-xs font-medium">
            <GraduationCap className="w-3 h-3" />
            Year {year}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-white text-xs font-medium capitalize">
            <AtSign className="w-3 h-3" />
            {me.role}
          </span>
          {me.program_id && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white text-[#006633] text-xs font-medium">
              Program assigned
            </span>
          )}
        </div>
      </div>

      {/* ── Settings list ── */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg divide-y divide-[#f0f0f0] overflow-hidden">
        {/* Year row — expands to the picker */}
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === "year" ? null : "year")}
            aria-expanded={open === "year"}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#fafafa] transition-colors text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-[#e6f0e8] flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-[#006633]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-[#333]">Class year</span>
              <span className="block text-xs text-[#999]">
                {savedYearFlash ? `Saved — Year ${savedYearFlash}` : `Year ${year} · decides which courses you see`}
              </span>
            </span>
            <ChevronDown className={`w-4 h-4 text-[#ccc] shrink-0 transition-transform ${open === "year" ? "rotate-180" : ""}`} />
          </button>
          {open === "year" && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <button
                    key={y}
                    type="button"
                    disabled={savingYear}
                    onClick={() => saveYear(y)}
                    className={`relative py-2.5 rounded-md text-sm font-medium border transition-colors ${
                      y === year
                        ? "bg-[#006633] text-white border-[#006633]"
                        : "bg-white text-[#333] border-[#e0e0e0] hover:border-[#006633] hover:text-[#006633]"
                    }`}
                  >
                    Year {y}
                    {savingYear && y === year && (
                      <Loader2 className="w-3 h-3 animate-spin absolute top-1.5 right-1.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Password row — expands to the form */}
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === "password" ? null : "password")}
            aria-expanded={open === "password"}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#fafafa] transition-colors text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-[#e6f0e8] flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4 text-[#006633]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-[#333]">Password</span>
              <span className="block text-xs text-[#999]">Last changed by you · tap to update</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-[#ccc] shrink-0 transition-transform ${open === "password" ? "rotate-180" : ""}`} />
          </button>
          {open === "password" && (
            <form onSubmit={changePassword} className="px-4 pb-4">
              <p className="text-xs text-[#999] mb-3">You&apos;ll need your current password to set a new one.</p>
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="text-xs text-[#666] hover:text-[#006633] transition-colors inline-flex items-center gap-1"
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="input-field text-sm mb-3"
                placeholder="Current password"
                autoComplete="current-password"
                required
              />
              <input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="input-field text-sm mb-2"
                placeholder="New password (min. 6 characters)"
                autoComplete="new-password"
                required
              />
              <div className={`flex items-center gap-2 mb-3 ${pwLen === 0 ? "opacity-0" : ""}`}>
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3].map((seg) => (
                    <div key={seg} className={`h-1 flex-1 rounded-full ${pwScore >= seg ? pwColor : "bg-[#e0e0e0]"}`} />
                  ))}
                </div>
                <span className="text-xs text-[#666] whitespace-nowrap">{pwLabel}</span>
              </div>
              <input
                type={showPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="input-field text-sm mb-1"
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />
              {pwMismatch && (
                <p className="text-xs text-[#721c24] mb-2">Passwords don&apos;t match yet.</p>
              )}
              <div className="flex justify-end mt-3">
                <button
                  type="submit"
                  disabled={savingPw || !currentPw || !newPw || !confirmPw}
                  className="btn-primary text-sm"
                >
                  {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update password
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Name + email row — read-only, admin-managed */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="w-8 h-8 rounded-lg bg-[#f0f0f0] flex items-center justify-center shrink-0">
            <UserRound className="w-4 h-4 text-[#999]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-[#333]">Full name</span>
            <span className="block text-xs text-[#999] truncate">{me.full_name || "Not set"} · {me.email}</span>
          </span>
          <span className="text-xs text-[#999] shrink-0">Managed by admin</span>
        </div>
      </div>

      {/* ── More ── */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg divide-y divide-[#f0f0f0] overflow-hidden">
        {/* Install as an app — hidden entirely once running standalone */}
        {typeof window !== "undefined" && !window.matchMedia("(display-mode: standalone)").matches && !installDone && (
          <button
            type="button"
            onClick={handleInstall}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#fafafa] transition-colors text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-[#006633] flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-white" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-[#333]">Download app</span>
              <span className="block text-xs text-[#999]">Adds OLLIN to your home screen</span>
            </span>
            {installEvent ? (
              <span className="text-xs font-medium text-[#006633] shrink-0">Get</span>
            ) : (
              <span className="text-xs text-[#999] shrink-0">{isIos() ? "via Safari share" : "via browser menu"}</span>
            )}
          </button>
        )}
        <a
          href="/support?from=dashboard"
          className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#fafafa] no-underline transition-colors"
        >
          <span className="w-8 h-8 rounded-lg bg-[#e6f0e8] flex items-center justify-center shrink-0">
            <LifeBuoy className="w-4 h-4 text-[#006633]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-[#333]">Help &amp; support</span>
            <span className="block text-xs text-[#999]">Message your administrator</span>
          </span>
          <ChevronRight className="w-4 h-4 text-[#ccc] shrink-0" />
        </a>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 transition-colors text-left"
        >
          <span className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-red-600" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-red-600">Log out</span>
            <span className="block text-xs text-[#999]">End your session on this device</span>
          </span>
        </button>
      </div>

      <p className="text-xs text-[#999] text-center pb-2">
        Email, role, and program are managed by your administrator.
      </p>
    </div>
  );
}
