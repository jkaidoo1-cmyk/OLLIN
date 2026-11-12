"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, GraduationCap, Save, X, Pen, AlertCircle, RefreshCw } from "lucide-react";
import { Program } from "@/lib/types";
import { clearStaleAdminSession } from "@/lib/admin";
import { useConfirm } from "@/components/ui/toast";
import { SkeletonList } from "@/components/Skeleton";

/** True when the server rejected the admin session itself. */
function isAuthError(msg: string): boolean {
  return msg === "Admin access required" || msg === "Not authenticated";
}

type PendingAction =
  | { type: "add"; program: Program }
  | { type: "update"; program: Program }
  | { type: "delete"; programId: string };

interface EditState {
  program: Program;
  code: string;
  name: string;
  dept: string;
  desc: string;
}

export default function AdminProgramsPage() {
  const confirmDialog = useConfirm();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [pending, setPending] = useState<PendingAction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);

  const isLocal = typeof window !== "undefined" && localStorage.getItem("ollin_local_user") !== null;

  useEffect(() => { fetchPrograms(); }, []);

  const fetchPrograms = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/programs", {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      setPrograms(data.programs || []);
    } catch (err) {
      // Never let a failed load look like an empty table: "No programs yet"
      // after a refresh reads as "the program I added is gone".
      setLoadError(
        err instanceof Error ? `Could not load programs: ${err.message}` : "Could not load programs."
      );
    } finally { setLoading(false); }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formCode.trim() || !formName.trim()) {
      setFormError("Code and name are required");
      return;
    }

    const newProgram: Program = {
      id: `pending-${Date.now()}`,
      code: formCode,
      name: formName,
      department: formDept || null,
      description: formDesc || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    void persist({ type: "add", program: newProgram });
    setFormCode("");
    setFormName("");
    setFormDept("");
    setFormDesc("");
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Remove this program?",
      body: "This removes it immediately and cannot be undone.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    void persist({ type: "delete", programId: id });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) {
      setFormError("Code and name are required");
      return;
    }
    const updated: Program = {
      ...editing.program,
      code: editing.code.trim(),
      name: editing.name.trim(),
      department: editing.dept || null,
      description: editing.desc || null,
      updated_at: new Date().toISOString(),
    };
    void persist({ type: "update", program: updated });
    setEditing(null);
  };  const sendRequest = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(isLocal ? { "x-local-mode": "true" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Failed (${res.status})`);
    }
  };

  const applyAction = async (action: PendingAction) => {
    if (action.type === "add") {
      await sendRequest("POST", "/api/programs", { code: action.program.code, name: action.program.name, department: action.program.department, description: action.program.description });
    } else if (action.type === "update") {
      await sendRequest("PATCH", "/api/programs", { id: action.program.id, code: action.program.code, name: action.program.name, department: action.program.department, description: action.program.description });
    } else if (action.type === "delete") {
      await sendRequest("DELETE", `/api/programs?id=${action.programId}`);
    }
  };

  const reportSaveError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "Save failed";
    if (isAuthError(msg)) {
      setSaveError("Your session has expired — redirecting to login…");
      setTimeout(() => clearStaleAdminSession(), 1200);
    } else {
      setSaveError(`Save failed: ${msg}. Your change is still listed — press Save to retry.`);
    }
  };

  // Changes are written immediately. Staging them until a Save click made
  // "I added a program" and "it never persisted" indistinguishable: the row
  // lived only in local state, so a reload or any navigation discarded it.
  const persist = async (action: PendingAction) => {
    setSaveError("");
    setPending((prev) => [...prev, action]);
    try {
      await applyAction(action);
      setPending((prev) => prev.filter((a) => a !== action));
    } catch (err) {
      reportSaveError(err);
    } finally {
      // Re-read so the list shows the server's real state either way.
      await fetchPrograms();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Retry path: anything that failed to write is still pending.
      for (const action of pending) await applyAction(action);
      setPending([]);
    } catch (err) {
      reportSaveError(err);
    } finally {
      await fetchPrograms();
      setSaving(false);
    }
  };

  const displayPrograms = (() => {
    let result = [...programs];
    for (const action of pending) {
      if (action.type === "add") result.push(action.program);
      else if (action.type === "update") result = result.map((p) => (p.id === action.program.id ? action.program : p));
      else if (action.type === "delete") result = result.filter((p) => p.id !== action.programId);
    }
    return result;
  })();

  return (
    <div className="pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#333]">Programs</h1>
          <p className="text-xs text-[#999] mt-0.5">{programs.length} programs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchPrograms()}
            disabled={loading}
            title="Reload programs from the server"
            className="text-xs px-3 py-2 border border-[#e0e0e0] rounded hover:border-green-400 text-[#666] flex items-center gap-1.5 justify-center disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add program
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-2 text-xs px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{loadError}</span>
          <button onClick={() => void fetchPrograms()} className="font-medium underline shrink-0">Retry</button>
        </div>
      )}

      {editing && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#333] mb-4">Edit program</h2>
          {formError && <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">{formError}</div>}
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Program code</label>
                <input type="text" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} required placeholder="e.g. BSc CS" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Program name</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required placeholder="e.g. BSc Computer Science" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Department</label>
                <input type="text" value={editing.dept} onChange={(e) => setEditing({ ...editing, dept: e.target.value })} placeholder="e.g. Computer Science" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Description</label>
                <input type="text" value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} placeholder="Brief description" className="input-field text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> Save changes
              </button>
              <button type="button" onClick={() => setEditing(null)} className="text-xs text-[#666] hover:text-[#333] px-3 py-2">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#333] mb-4">New program</h2>

          {formError && <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">{formError}</div>}

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Program code</label>
                <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)} required placeholder="e.g. BSc CS" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Program name</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="e.g. BSc Computer Science" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Department</label>
                <input type="text" value={formDept} onChange={(e) => setFormDept(e.target.value)} placeholder="e.g. Computer Science" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Description</label>
                <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description" className="input-field text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Create program
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#666] hover:text-[#333] px-3 py-2">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={3} rowClass="h-14" />
      ) : programs.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#999]">
          {loadError
            ? "Programs could not be loaded — press Refresh to try again."
            : "No programs yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {programs.map((prog) => {
            const isPendingAdd = pending.some((a) => a.type === "add" && a.program.id === prog.id);
            const isPendingUpdate = pending.some((a) => a.type === "update" && a.program.id === prog.id);
            const isPendingDelete = pending.some((a) => a.type === "delete" && a.programId === prog.id);
            return (
              <div key={prog.id} className={`bg-white border rounded-lg p-4 flex items-center gap-3 ${
                isPendingAdd ? "border-green-300 bg-green-50/30" :
                isPendingUpdate ? "border-amber-300 bg-amber-50/30" :
                isPendingDelete ? "border-red-300 bg-red-50/30 opacity-50" :
                "border-[#e0e0e0]"
              }`}>
                <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">{prog.code}</span>
                    <p className="text-sm font-medium text-[#333] truncate">{prog.name}</p>
                  </div>
                  {prog.description && <p className="text-xs text-[#999] mt-0.5 truncate">{prog.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPendingAdd && <span className="text-[10px] text-green-600 font-medium">NEW</span>}
                  {isPendingUpdate && <span className="text-[10px] text-amber-600 font-medium">EDITED</span>}
                  {isPendingDelete && <span className="text-[10px] text-red-500 font-medium">REMOVED</span>}
                  {prog.department && (
                    <span className="text-[10px] text-[#999] bg-slate-50 px-2 py-0.5 rounded border border-slate-100 hidden sm:inline">{prog.department}</span>
                  )}
                  {!isPendingAdd && !isPendingUpdate && !isPendingDelete && (
                    <>
                      <button
                        onClick={() => setEditing({
                          program: prog,
                          code: prog.code,
                          name: prog.name,
                          dept: prog.department || "",
                          desc: prog.description || "",
                        })}
                        className="p-1.5 rounded hover:bg-amber-50 text-[#999] hover:text-amber-600 transition-colors"
                        title="Edit"
                      >
                        <Pen className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(prog.id)} className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
