"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, GraduationCap, Save, X } from "lucide-react";
import { Program } from "@/lib/types";

type PendingAction =
  | { type: "add"; program: Program }
  | { type: "delete"; programId: string };

export default function AdminProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState("");

  const [pending, setPending] = useState<PendingAction[]>([]);
  const [saving, setSaving] = useState(false);

  const isDemo = typeof window !== "undefined" && localStorage.getItem("ollin_demo_user") !== null;

  useEffect(() => { fetchPrograms(); }, []);

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/programs", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const data = await res.json();
      setPrograms(data.programs || []);
    } catch { /* ignore */ } finally { setLoading(false); }
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

    setPending((prev) => [...prev, { type: "add", program: newProgram }]);
    setFormCode("");
    setFormName("");
    setFormDept("");
    setFormDesc("");
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this program? (changes won't apply until you save)")) return;
    setPending((prev) => [...prev, { type: "delete", programId: id }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isDemo) {
        let updated = [...programs];
        for (const action of pending) {
          if (action.type === "add") {
            updated = [...updated, action.program];
          } else if (action.type === "delete") {
            updated = updated.filter((p) => p.id !== action.programId);
          }
        }
        setPrograms(updated);
        // Persist via API
        for (const action of pending) {
          if (action.type === "add") {
            await fetch("/api/programs", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-demo-mode": "true" },
              body: JSON.stringify({ code: action.program.code, name: action.program.name, department: action.program.department, description: action.program.description }),
            });
          } else if (action.type === "delete") {
            await fetch(`/api/programs?id=${action.programId}`, { method: "DELETE", headers: { "x-demo-mode": "true" } });
          }
        }
      } else {
        for (const action of pending) {
          if (action.type === "add") {
            await fetch("/api/programs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: action.program.code, name: action.program.name, department: action.program.department, description: action.program.description }),
            });
          } else if (action.type === "delete") {
            await fetch(`/api/programs?id=${action.programId}`, { method: "DELETE" });
          }
        }
        await fetchPrograms();
      }

      // Sync localStorage with server file for student-side compatibility
      if (isDemo) {
        try {
          const res2 = await fetch("/api/programs", { headers: { "x-demo-mode": "true" } });
          const data2 = await res2.json();
          localStorage.setItem("ollin_demo_programs", JSON.stringify(data2.programs || []));
        } catch { /* ignore */ }
      }

      const { addNotification } = await import("@/lib/demo");
      const adds = pending.filter((a) => a.type === "add").length;
      const deletes = pending.filter((a) => a.type === "delete").length;
      const parts: string[] = [];
      if (adds) parts.push(`${adds} program${adds > 1 ? "s" : ""} added`);
      if (deletes) parts.push(`${deletes} program${deletes > 1 ? "s" : ""} removed`);
      addNotification("Programs updated", parts.join(", ") + ".", "system");

      setPending([]);
    } finally {
      setSaving(false);
    }
  };

  const displayPrograms = (() => {
    let result = [...programs];
    for (const action of pending) {
      if (action.type === "add") result.push(action.program);
      else if (action.type === "delete") result = result.filter((p) => p.id !== action.programId);
    }
    return result;
  })();

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#333]">Programs</h1>
          <p className="text-xs text-[#999] mt-0.5">{displayPrograms.length} programs {pending.length > 0 && `(${pending.length} pending)`}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add program
        </button>
      </div>

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
                <Plus className="w-3.5 h-3.5" /> Add to changes
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#666] hover:text-[#333] px-3 py-2">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-sm text-[#999]">Loading...</div>
      ) : displayPrograms.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#999]">No programs yet.</div>
      ) : (
        <div className="space-y-2">
          {displayPrograms.map((prog) => {
            const isPendingAdd = pending.some((a) => a.type === "add" && a.program.id === prog.id);
            const isPendingDelete = pending.some((a) => a.type === "delete" && a.programId === prog.id);
            return (
              <div key={prog.id} className={`bg-white border rounded-lg p-4 flex items-center gap-3 ${
                isPendingAdd ? "border-green-300 bg-green-50/30" :
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
                  {isPendingDelete && <span className="text-[10px] text-red-500 font-medium">REMOVED</span>}
                  {prog.department && (
                    <span className="text-[10px] text-[#999] bg-slate-50 px-2 py-0.5 rounded border border-slate-100 hidden sm:inline">{prog.department}</span>
                  )}
                  {!isPendingAdd && !isPendingDelete && (
                    <button onClick={() => handleDelete(prog.id)} className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors" title="Delete">
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
              <button onClick={() => setPending([])} className="px-4 py-2 text-sm text-[#666] hover:text-[#333] border border-[#e0e0e0] rounded-lg flex items-center gap-1.5">
                <X className="w-4 h-4" /> Discard
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm text-white bg-[#006633] hover:bg-[#004d26] rounded-lg flex items-center gap-1.5">
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
