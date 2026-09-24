"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, LifeBuoy, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { isLocalMode, disableLocalMode } from "@/lib/local";
import { createClient } from "@/lib/supabase/client";

/**
 * Student profile — self-service account page.
 *
 * Shows the account details the admin controls (email, role, program) and
 * lets the student update what's theirs: display name, current year, and
 * password (with current-password verification, enforced server-side).
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#333]">My profile</h1>
        <p className="text-xs text-[#999] mt-0.5">Your account details and settings</p>
      </div>

      {/* Account details (read-only — managed by the admin) */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#333] mb-3">Account</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#999]">Email</dt>
            <dd className="text-[#333] font-medium truncate">{me.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#999]">Role</dt>
            <dd className="text-[#333] font-medium capitalize">{me.role}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#999]">Program</dt>
            <dd className="text-[#333] font-medium">
              {me.program_id ? "Assigned" : "Not assigned yet"}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-[#999] mt-3">
          Email, role, and program are managed by your administrator.
        </p>
      </div>

      {/* Editable profile */}
      <form onSubmit={saveProfile} className="bg-white border border-[#e0e0e0] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#333] mb-4">Details you can change</h2>
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
        <button
          type="submit"
          disabled={savingProfile || !name.trim()}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </button>
      </form>

      {/* Password */}
      <form onSubmit={changePassword} className="bg-white border border-[#e0e0e0] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#333] mb-1 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-green-600" /> Change password
        </h2>
        <p className="text-xs text-[#999] mb-4">You'll need your current password to set a new one.</p>
        <label className="block text-xs font-medium text-[#666] mb-1">Current password</label>
        <input
          type="password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          className="input-field text-sm mb-3"
          autoComplete="current-password"
          required
        />
        <label className="block text-xs font-medium text-[#666] mb-1">New password</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          className="input-field text-sm mb-3"
          placeholder="Minimum 6 characters"
          autoComplete="new-password"
          required
        />
        <label className="block text-xs font-medium text-[#666] mb-1">Confirm new password</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          className="input-field text-sm mb-4"
          autoComplete="new-password"
          required
        />
        <button
          type="submit"
          disabled={savingPw || !currentPw || !newPw || !confirmPw}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
          Change password
        </button>
      </form>

      {/* Help & support + logout — moved here from the profile dropdown */}
      <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#333] mb-3">More</h2>
        <div className="space-y-2">
          <a
            href="/support?from=dashboard"
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#333] border border-[#e0e0e0] rounded hover:bg-[#f8f8f8] no-underline transition-colors"
          >
            <LifeBuoy className="w-4 h-4 text-[#006633]" />
            Help &amp; support
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 border border-[#e0e0e0] rounded hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
