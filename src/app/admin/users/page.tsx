"use client";

import { useEffect, useState } from "react";
import { UserPlus, Loader2, Trash2, Shield, GraduationCap, Mail, Eye, EyeOff, Save, X, AlertCircle } from "lucide-react";
import { Program } from "@/lib/types";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  program_id: string | null;
  created_at: string;
}

type PendingAction =
  | { type: "add"; user: User }
  | { type: "delete"; userId: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("student");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [formProgramId, setFormProgramId] = useState("");

  // Pending changes
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [saving, setSaving] = useState(false);

  const isDemo = typeof window !== "undefined" && localStorage.getItem("ollin_demo_user") !== null;

  useEffect(() => {
    fetchUsers();
    fetchPrograms();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchPrograms = async () => {
    try {
      const res = await fetch("/api/programs", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const data = await res.json();
      setPrograms(data.programs || []);
    } catch { /* ignore */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Stage the new user as a pending add
    const newUser: User = {
      id: `pending-${Date.now()}`,
      email: formEmail,
      full_name: formName,
      role: formRole,
      program_id: formProgramId || null,
      created_at: new Date().toISOString(),
    };

    setPending((prev) => [...prev, { type: "add", user: newUser }]);
    setFormEmail("");
    setFormPassword("");
    setFormName("");
    setFormRole("student");
    setFormProgramId("");
    setShowForm(false);
  };

  const handleDelete = (userId: string) => {
    if (!confirm("Remove this user? (changes won't apply until you save)")) return;
    setPending((prev) => [...prev, { type: "delete", userId }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isDemo) {
        // Apply pending changes to state directly in demo mode
        let updated = [...users];
        for (const action of pending) {
          if (action.type === "add") {
            updated = [...updated, action.user];
          } else if (action.type === "delete") {
            updated = updated.filter((u) => u.id !== action.userId);
          }
        }
        setUsers(updated);
        // Also persist to the API for demo
        for (const action of pending) {
          if (action.type === "add") {
            await fetch("/api/admin/users", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-demo-mode": "true" },
              body: JSON.stringify({ email: action.user.email, password: "password123", full_name: action.user.full_name, role: action.user.role, program_id: action.user.program_id }),
            });
          } else if (action.type === "delete") {
            await fetch(`/api/admin/users?id=${action.userId}`, { method: "DELETE", headers: { "x-demo-mode": "true" } });
          }
        }
      } else {
        // Production: apply via API
        for (const action of pending) {
          if (action.type === "add") {
            await fetch("/api/admin/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: action.user.email, password: "password123", full_name: action.user.full_name, role: action.user.role, program_id: action.user.program_id }),
            });
          } else if (action.type === "delete") {
            await fetch(`/api/admin/users?id=${action.userId}`, { method: "DELETE" });
          }
        }
        await fetchUsers();
      }

      // Sync localStorage with server file for auth compatibility
      if (isDemo) {
        try {
          const res2 = await fetch("/api/admin/users", { headers: { "x-demo-mode": "true" } });
          const data2 = await res2.json();
          localStorage.setItem("ollin_demo_users", JSON.stringify(data2.users || []));
        } catch { /* ignore */ }
      }

      // Notify
      const { addNotification } = await import("@/lib/demo");
      const adds = pending.filter((a) => a.type === "add").length;
      const deletes = pending.filter((a) => a.type === "delete").length;
      const parts: string[] = [];
      if (adds) parts.push(`${adds} user${adds > 1 ? "s" : ""} added`);
      if (deletes) parts.push(`${deletes} user${deletes > 1 ? "s" : ""} removed`);
      addNotification("Users updated", parts.join(", ") + ".", "system");

      setPending([]);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setPending([]);
  };

  // Compute displayed users with pending changes applied
  const displayUsers = (() => {
    let result = [...users];
    for (const action of pending) {
      if (action.type === "add") {
        result.push(action.user);
      } else if (action.type === "delete") {
        result = result.filter((u) => u.id !== action.userId);
      }
    }
    return result;
  })();

  const roleBadge = (role: string) => {
    if (role === "admin") return "bg-red-50 text-red-600 border-red-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  const roleIcon = (role: string) => {
    if (role === "admin") return <Shield className="w-3 h-3" />;
    return <GraduationCap className="w-3 h-3" />;
  };

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#333]">Users</h1>
          <p className="text-xs text-[#999] mt-0.5">{displayUsers.length} accounts {pending.length > 0 && `(${pending.length} pending)`}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary text-xs flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" /> Create user
        </button>
      </div>

      {/* Create User Form */}
      {showForm && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#333] mb-4">New account</h2>

          {formError && (
            <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Full name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="John Doe"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  placeholder="student@university.edu"
                  className="input-field text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    className="input-field text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#666]"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Program</label>
              <select value={formProgramId} onChange={(e) => setFormProgramId(e.target.value)} className="input-field text-sm">
                <option value="">No program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" /> Add to changes
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-[#666] hover:text-[#333] px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-[#999]">Loading...</div>
      ) : displayUsers.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#999]">No users found</div>
      ) : (
        <div className="space-y-2">
          {displayUsers.map((user) => {
            const isPendingAdd = pending.some((a) => a.type === "add" && a.user.id === user.id);
            const isPendingDelete = pending.some((a) => a.type === "delete" && a.userId === user.id);

            return (
              <div
                key={user.id}
                className={`bg-white border rounded-lg p-3.5 flex items-center gap-3 ${
                  isPendingAdd ? "border-green-300 bg-green-50/30" :
                  isPendingDelete ? "border-red-300 bg-red-50/30 opacity-50" :
                  "border-[#e0e0e0]"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                  {user.full_name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#333] truncate">{user.full_name}</p>
                  <p className="text-xs text-[#999] truncate">{user.email}</p>
                  {user.program_id && (
                    <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-green-100">
                      {programs.find((p) => p.id === user.program_id)?.code || "Program"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPendingAdd && <span className="text-[10px] text-green-600 font-medium">NEW</span>}
                  {isPendingDelete && <span className="text-[10px] text-red-500 font-medium">REMOVED</span>}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${roleBadge(user.role)}`}>
                    {roleIcon(user.role)}
                    {user.role}
                  </span>
                  <span className="text-[10px] text-[#999] hidden sm:inline">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                  {user.role !== "admin" && !isPendingAdd && !isPendingDelete && (
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors"
                      title="Delete user"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save bar */}
      {pending.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e0e0e0] shadow-lg z-50">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-sm text-[#333]">
              <span className="font-semibold">{pending.length} change{pending.length > 1 ? "s" : ""}</span> pending
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscard}
                className="px-4 py-2 text-sm text-[#666] hover:text-[#333] border border-[#e0e0e0] rounded-lg flex items-center gap-1.5"
              >
                <X className="w-4 h-4" /> Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-[#006633] hover:bg-[#004d26] rounded-lg flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
