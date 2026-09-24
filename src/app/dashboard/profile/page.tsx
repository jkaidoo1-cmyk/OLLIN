"use client";

import { useEffect, useState } from "react";
import { AtSign, ChevronRight, Eye, EyeOff, GraduationCap, KeyRound, Loader2, LogOut, LifeBuoy, ShieldCheck, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { isLocalMode, disableLocalMode } from "@/lib/local";
import { createClient } from "@/lib/supabase/client";

/**
 * Student profile — self-service account page.
 *
 * Header card shows who you are (name, email, role, year, program). Below it,
 * two cards: what you can change (name, year) and security (password, with
 * current-password verification enforced server-side). Account actions
 * (help, logout) sit at the bottom.
 */

interface Me {
  id: string;
  email: string;
  full_name: string;
  role: string;
  program_id?: string | null;
  current_year?: number | null;
}

export default function ProfilePage() {
  const toast = useToast();
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Name / year form
  const [name, setName] = useState("");
  const [year, setYear] = useState<number>(1);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setMe(data.user);
          setName(data.user?.full_name || "");
          setYear(data.user?.current_year || 1);
        }
      } catch { /* page shows signed-out state */ }
      finally { setLoading(false); }
    })();
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim(), current_year: year }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Profile updated");
        setMe((m) => (m ? { ...m, full_name: name.trim(), current_year: year } : m));
        // Keep the local mirror in sync (dashboard header reads it).
        try {
          const raw = localStorage.getItem("ollin_local_user");
          if (raw) {
            const u = JSON.parse(raw);
            u.full_name = name.trim();
            u.current_year = year;
            localStorage.setItem("ollin_local_user", JSON.stringify(u));
          }
        } catch { /* mirror is optional */ }
      } else {
        toast.error(data.error || "Could not update profile");
      }
    } catch {
      toast.error("Could not update profile. Check your connection.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    if (isLocalMode()) {
      // Clear the httpOnly session cookie server-side too.
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
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <Loader2 className="w-8 h-8 text-[#ccc] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#666]">Loading…</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-12 text-center">
          <UserRound className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm text-[#666]">You need to be logged in to view your profile.</p>
        </div>
      </div>
    );
  }

  const initial = (me.full_name || me.email).charAt(0).toUpperCase();
  const pwLen = newPw.length;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;
  const pwLabel = ["", "Too short — 6 minimum", "Decent — add more for strength", "Strong password"][pwScore];
  const pwColor = ["bg-[#e0e0e0]", "bg-red-400", "bg-amber-400", "bg-green-500"][pwScore];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Identity header */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#e6f0e8] flex items-center justify-center text-2xl font-bold text-[#006633] shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#333] truncate">{me.full_name || "Student"}</h1>
            <p className="text-sm text-[#666] truncate">{me.email}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="badge badge-primary capitalize">
                <UserRound className="w-3 h-3" />
                {me.role}
              </span>
              <span className="badge badge-success">
                <GraduationCap className="w-3 h-3" />
                Year {me.current_year || 1}
              </span>
              <span className="badge badge-slate">
                <AtSign className="w-3 h-3" />
                {me.program_id ? "Program assigned" : "No program yet"}
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-[#999] mt-4 pt-4 border-t border-[#f0f0f0]">
          Email, role, and program are managed by your administrator. Everything else, you can change below.
        </p>
      </div>

      {/* Editable details + security — side by side on desktop */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Details you can change */}
        <form onSubmit={saveProfile} className="bg-white border border-[#e0e0e0] rounded-lg p-5 h-fit">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-[#e6f0e8] flex items-center justify-center shrink-0">
              <UserRound className="w-4 h-4 text-[#006633]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#333]">Your details</h2>
              <p className="text-xs text-[#999]">The name teachers see, and your class year.</p>
            </div>
          </div>
          <label className="block text-xs font-medium text-[#666] mb-1.5">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field text-sm mb-5"
            placeholder="Your name"
            maxLength={120}
            required
          />
          <label className="block text-xs font-medium text-[#666] mb-1.5">Current year</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={`py-2.5 rounded-md text-sm font-medium border transition-colors ${
                  year === y
                    ? "bg-[#006633] text-white border-[#006633]"
                    : "bg-white text-[#333] border-[#e0e0e0] hover:border-[#006633] hover:text-[#006633]"
                }`}
              >
                Year {y}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#999] mb-5">
            Your year decides which courses you see on the dashboard.
          </p>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile || !name.trim() || (name.trim() === me.full_name && year === (me.current_year || 1))}
              className="btn-primary w-full sm:w-auto"
            >
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>

        {/* Security */}
        <form onSubmit={changePassword} className="bg-white border border-[#e0e0e0] rounded-lg p-5 h-fit">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#e6f0e8] flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4 text-[#006633]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#333]">Change password</h2>
                <p className="text-xs text-[#999]">Confirm your current one first.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="text-[#666] hover:text-[#006633] transition-colors p-1"
              aria-label={showPw ? "Hide passwords" : "Show passwords"}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <label className="block text-xs font-medium text-[#666] mb-1.5">Current password</label>
          <input
            type={showPw ? "text" : "password"}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            className="input-field text-sm mb-4"
            autoComplete="current-password"
            required
          />
          <label className="block text-xs font-medium text-[#666] mb-1.5">New password</label>
          <input
            type={showPw ? "text" : "password"}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="input-field text-sm mb-2"
            placeholder="Minimum 6 characters"
            autoComplete="new-password"
            required
          />
          {/* Strength meter */}
          <div className={`flex items-center gap-2 mb-4 ${pwLen === 0 ? "opacity-0" : ""}`}>
            <div className="flex gap-1 flex-1">
              {[1, 2, 3].map((seg) => (
                <div key={seg} className={`h-1 flex-1 rounded-full ${pwScore >= seg ? pwColor : "bg-[#e0e0e0]"}`} />
              ))}
            </div>
            <span className="text-xs text-[#666] whitespace-nowrap">{pwLabel}</span>
          </div>
          <label className="block text-xs font-medium text-[#666] mb-1.5">Confirm new password</label>
          <input
            type={showPw ? "text" : "password"}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            className="input-field text-sm mb-4"
            autoComplete="new-password"
            required
          />
          {confirmPw.length > 0 && newPw !== confirmPw && (
            <p className="text-xs text-[#721c24] -mt-2 mb-3">Passwords don&apos;t match yet.</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPw || !currentPw || !newPw || !confirmPw}
              className="btn-primary w-full sm:w-auto"
            >
              {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
              Change password
            </button>
          </div>
        </form>
      </div>

      {/* Account actions — settings list */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden">
        <a
          href="/support?from=dashboard"
          className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#f8f8f8] no-underline transition-colors"
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
        <div className="border-t border-[#f0f0f0]" />
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
    </div>
  );
}
