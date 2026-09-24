"use client";

import { useEffect, useState } from "react";
import { AtSign, Eye, EyeOff, GraduationCap, KeyRound, Loader2, LogOut, LifeBuoy, ShieldCheck, UserRound } from "lucide-react";
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
  const pwStrength = newPw.length === 0 ? null : newPw.length < 6 ? "weak" : "ok";

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
          <h2 className="text-sm font-semibold text-[#333] mb-4 flex items-center gap-2">
            <UserRound className="w-4 h-4 text-[#006633]" />
            Your details
          </h2>
          <label className="block text-xs font-medium text-[#666] mb-1">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field text-sm mb-4"
            placeholder="Your name"
            maxLength={120}
            required
          />
          <label className="block text-xs font-medium text-[#666] mb-1">Current year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input-field text-sm mb-4"
          >
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <option key={y} value={y}>Year {y}</option>
            ))}
          </select>
          <p className="text-xs text-[#999] mb-4">
            Your year decides which courses you see on the dashboard.
          </p>
          <button
            type="submit"
            disabled={savingProfile || !name.trim() || (name.trim() === me.full_name && year === (me.current_year || 1))}
            className="btn-primary w-full"
          >
            {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
            Save changes
          </button>
        </form>

        {/* Security */}
        <form onSubmit={changePassword} className="bg-white border border-[#e0e0e0] rounded-lg p-5 h-fit">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-[#333] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#006633]" />
              Change password
            </h2>
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="text-[#666] hover:text-[#006633] transition-colors p-1"
              aria-label={showPw ? "Hide passwords" : "Show passwords"}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-[#999] mb-4">You'll need your current password to set a new one.</p>
          <label className="block text-xs font-medium text-[#666] mb-1">Current password</label>
          <input
            type={showPw ? "text" : "password"}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            className="input-field text-sm mb-3"
            autoComplete="current-password"
            required
          />
          <label className="block text-xs font-medium text-[#666] mb-1">New password</label>
          <input
            type={showPw ? "text" : "password"}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="input-field text-sm mb-1.5"
            placeholder="Minimum 6 characters"
            autoComplete="new-password"
            required
          />
          {pwStrength && (
            <p className={`text-xs mb-2 flex items-center gap-1 ${pwStrength === "weak" ? "text-[#856404]" : "text-[#155724]"}`}>
              <ShieldCheck className="w-3 h-3" />
              {pwStrength === "weak" ? "Too short — 6 characters minimum" : "Looks good"}
            </p>
          )}
          <label className="block text-xs font-medium text-[#666] mb-1">Confirm new password</label>
          <input
            type={showPw ? "text" : "password"}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            className="input-field text-sm mb-4"
            autoComplete="new-password"
            required
          />
          {confirmPw.length > 0 && newPw !== confirmPw && (
            <p className="text-xs text-[#721c24] mb-2">Passwords don't match yet.</p>
          )}
          <button
            type="submit"
            disabled={savingPw || !currentPw || !newPw || !confirmPw}
            className="btn-primary w-full"
          >
            {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
            Change password
          </button>
        </form>
      </div>

      {/* Account actions */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#333] mb-3">Account</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href="/support?from=dashboard"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-[#333] border border-[#e0e0e0] rounded hover:bg-[#f8f8f8] no-underline transition-colors"
          >
            <LifeBuoy className="w-4 h-4 text-[#006633]" />
            Help &amp; support
          </a>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-red-600 border border-[#e0e0e0] rounded hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
