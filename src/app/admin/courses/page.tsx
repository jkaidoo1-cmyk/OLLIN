"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, BookOpen, Save, X, ChevronDown, ChevronUp, Clock, Pen, AlertCircle } from "lucide-react";
import PageBanner, { BannerButton } from "@/components/PageBanner";
import { Course, Program, Quiz } from "@/lib/types";
import { getSavedQuizzes, removeSavedQuiz, syncSavedQuizzesFromServer } from "@/lib/local";
import { clearStaleAdminSession } from "@/lib/admin";
import { useConfirm } from "@/components/ui/toast";

/** True when the server rejected the admin session itself. */
function isAuthError(msg: string): boolean {
  return msg === "Admin access required" || msg === "Not authenticated";
}

type PendingAction =
  | { type: "add"; course: Course }
  | { type: "update"; course: Course }
  | { type: "delete"; courseId: string };

interface EditState {
  course: Course;
  code: string;
  name: string;
  dept: string;
  desc: string;
  programId: string;
  year: number | "";
}

export default function AdminCoursesPage() {
  const confirmDialog = useConfirm();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseQuizzes, setCourseQuizzes] = useState<Record<string, Quiz[]>>({});

  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDept, setFormDept] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [formProgramId, setFormProgramId] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formYear, setFormYear] = useState<number | "">("");
  const [formError, setFormError] = useState("");

  const [pending, setPending] = useState<PendingAction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);

  const isLocal = typeof window !== "undefined" && localStorage.getItem("ollin_local_user") !== null;

  useEffect(() => {
    fetchCourses();
    fetchPrograms();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/courses", {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      const data = await res.json();
      const courseList = data.courses || [];
      setCourses(courseList);
      // Preload quiz associations once (single fetch) so each course row shows its count
      await loadAllQuizzesForCourses(courseList);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  // Bulk-load quizzes for every course in one pass (no per-course fetch spam)
  const loadAllQuizzesForCourses = async (courseList: Course[]) => {
    try {
      await syncSavedQuizzesFromServer();
      const saved = getSavedQuizzes();
      if (courseList.length === 0 || saved.length === 0) return;

      const res = await fetch("/api/quizzes", {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      const data = await res.json();
      const apiQuizzes = data.quizzes || [];

      let clientQuizzes: any[] = [];
      try {
        const stored = localStorage.getItem("ollin_local_quizzes");
        clientQuizzes = stored ? JSON.parse(stored) : [];
      } catch { /* ignore */ }

      const allQuizzes = [...apiQuizzes];
      for (const cq of clientQuizzes) {
        if (!allQuizzes.some((q: any) => q.id === cq.id)) {
          allQuizzes.push(cq);
        }
      }

      const byCourse: Record<string, any[]> = {};
      for (const course of courseList) {
        const ids = new Set(saved.filter((s) => s.course_id === course.id).map((s) => s.quiz_id));
        byCourse[course.id] = allQuizzes.filter((q: any) => ids.has(q.id));
      }
      setCourseQuizzes(byCourse);
    } catch { /* ignore */ }
  };

  const fetchPrograms = async () => {
    try {
      const res = await fetch("/api/programs", {
        headers: isLocal ? { "x-local-mode": "true" } : {},
      });
      const data = await res.json();
      setPrograms(data.programs || []);
    } catch { /* ignore */ }
  };

  const handleRemoveQuizFromCourse = async (courseId: string, quizId: string) => {
    await removeSavedQuiz(quizId, courseId);
    await syncSavedQuizzesFromServer();
    setCourseQuizzes((prev) => ({
      ...prev,
      [courseId]: (prev[courseId] || []).filter((q) => q.id !== quizId),
    }));
  };

  const toggleExpand = (courseId: string) => {
    setExpandedCourseId(expandedCourseId === courseId ? null : courseId);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formCode.trim() || !formName.trim()) {
      setFormError("Code and name are required");
      return;
    }

    const newCourse: Course = {
      id: `pending-${Date.now()}`,
      code: formCode,
      name: formName,
      department: formDept || null,
      description: formDesc || null,
      program_id: formProgramId || null,
      year: formYear || null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setPending((prev) => [...prev, { type: "add", course: newCourse }]);
    setFormCode("");
    setFormName("");
    setFormDept("");
    setFormDesc("");
    setFormProgramId("");
    setFormYear("");
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Remove this course?",
      body: "It stays visible below until you save — nothing is deleted server-side yet.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setPending((prev) => [...prev, { type: "delete", courseId: id }]);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) {
      setFormError("Code and name are required");
      return;
    }
    const updated: Course = {
      ...editing.course,
      code: editing.code.trim(),
      name: editing.name.trim(),
      department: editing.dept || null,
      description: editing.desc || null,
      program_id: editing.programId || null,
      year: editing.year || null,
      updated_at: new Date().toISOString(),
    };
    setPending((prev) => [...prev, { type: "update", course: updated }]);
    setEditing(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Fire every pending mutation, checking each response. Any failure
      // aborts the save: pending actions are KEPT so nothing silently
      // disappears, and the list is re-fetched to reflect server reality.
      const send = async (method: string, url: string, body?: unknown) => {
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

      for (const action of pending) {
        if (action.type === "add") {
          await send("POST", "/api/courses", { code: action.course.code, name: action.course.name, department: action.course.department, description: action.course.description, program_id: action.course.program_id, year: action.course.year });
        } else if (action.type === "update") {
          await send("PATCH", "/api/courses", { id: action.course.id, code: action.course.code, name: action.course.name, department: action.course.department, description: action.course.description, program_id: action.course.program_id, year: action.course.year });
        } else if (action.type === "delete") {
          await send("DELETE", `/api/courses?id=${action.courseId}`);
        }
      }

      setPending([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (isAuthError(msg)) {
        setSaveError("Your session has expired — redirecting to login…");
        setTimeout(() => clearStaleAdminSession(), 1200);
      } else {
        setSaveError(`Save failed: ${msg}. Your changes are still listed — try saving again.`);
      }
    } finally {
      // Always re-fetch: on success it confirms persistence; on failure it
      // shows the server's actual state instead of optimistic fiction.
      await fetchCourses();
      setSaving(false);
    }
  };

  const displayCourses = (() => {
    let result = [...courses];
    for (const action of pending) {
      if (action.type === "add") result.push(action.course);
      else if (action.type === "update") result = result.map((c) => (c.id === action.course.id ? action.course : c));
      else if (action.type === "delete") result = result.filter((c) => c.id !== action.courseId);
    }
    return result;
  })();



  return (
    <div className="pb-24">
      <PageBanner
        title="Courses"
        subtitle={`${displayCourses.length} courses${pending.length > 0 ? ` (${pending.length} pending)` : ""}`}
        icon={<BookOpen className="w-5 h-5" />}
        actions={
          <BannerButton onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3.5 h-3.5" /> Add course
          </BannerButton>
        }
      />

      {saveError && (
        <div className="flex items-start gap-2 text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {editing && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#333] mb-4">Edit course</h2>
          {formError && <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">{formError}</div>}
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Course code</label>
                <input type="text" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} required placeholder="e.g. CSC 101" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Course name</label>
                <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required placeholder="e.g. Introduction to Computer Science" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Program</label>
                <select value={editing.programId} onChange={(e) => setEditing({ ...editing, programId: e.target.value })} className="input-field text-sm">
                  <option value="">No program</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Department</label>
                <input type="text" value={editing.dept} onChange={(e) => setEditing({ ...editing, dept: e.target.value })} placeholder="e.g. Computer Science" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Year level</label>
                <select value={editing.year} onChange={(e) => setEditing({ ...editing, year: e.target.value ? Number(e.target.value) : "" })} className="input-field text-sm">
                  <option value="">No year assigned</option>
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Description</label>
                <input type="text" value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} placeholder="Brief description of the course" className="input-field text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> Add to changes
              </button>
              <button type="button" onClick={() => setEditing(null)} className="text-xs text-[#666] hover:text-[#333] px-3 py-2">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#333] mb-4">New course</h2>
          {formError && <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded mb-4">{formError}</div>}
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Course code</label>
                <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)} required placeholder="e.g. CSC 101" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Course name</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="e.g. Introduction to Computer Science" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Program</label>
                <select value={formProgramId} onChange={(e) => setFormProgramId(e.target.value)} className="input-field text-sm">
                  <option value="">No program</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Department</label>
                <input type="text" value={formDept} onChange={(e) => setFormDept(e.target.value)} placeholder="e.g. Computer Science" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Year level</label>
                <select value={formYear} onChange={(e) => setFormYear(e.target.value ? Number(e.target.value) : "")} className="input-field text-sm">
                  <option value="">No year assigned</option>
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Description</label>
                <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description of the course" className="input-field text-sm" />
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
      ) : displayCourses.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#999]">No courses yet. Add one above.</div>
      ) : (
        <div className="space-y-2">
          {displayCourses.map((course) => {
            const isPendingAdd = pending.some((a) => a.type === "add" && a.course.id === course.id);
            const isPendingUpdate = pending.some((a) => a.type === "update" && a.course.id === course.id);
            const isPendingDelete = pending.some((a) => a.type === "delete" && a.courseId === course.id);
            const isExpanded = expandedCourseId === course.id;
            const quizzes = courseQuizzes[course.id] || [];

            return (
              <div key={course.id} className={`bg-white border rounded-lg overflow-hidden ${
                isPendingAdd ? "border-green-300 bg-green-50/30" :
                isPendingUpdate ? "border-amber-300 bg-amber-50/30" :
                isPendingDelete ? "border-red-300 bg-red-50/30 opacity-50" :
                "border-[#e0e0e0]"
              }`}>
                {/* Course header - clickable to expand */}
                <div
                  className="p-4 flex items-center gap-3 cursor-pointer hover:bg-[#f8f8f8] transition-colors"
                  onClick={() => !isPendingAdd && !isPendingDelete && toggleExpand(course.id)}
                >
                  <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">{course.code}</span>
                      <p className="text-sm font-medium text-[#333] truncate">{course.name}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {course.description && <p className="text-xs text-[#999] truncate">{course.description}</p>}
                      <span className="text-[10px] text-[#999]">
                        {quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isPendingAdd && <span className="text-[10px] text-green-600 font-medium">NEW</span>}
                    {isPendingUpdate && <span className="text-[10px] text-amber-600 font-medium">EDITED</span>}
                    {isPendingDelete && <span className="text-[10px] text-red-500 font-medium">REMOVED</span>}
                    {course.year && (
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 hidden sm:inline">Year {course.year}</span>
                    )}
                    {course.department && (
                      <span className="text-[10px] text-[#999] bg-slate-50 px-2 py-0.5 rounded border border-slate-100 hidden sm:inline">{course.department}</span>
                    )}
                    {!isPendingAdd && !isPendingUpdate && !isPendingDelete && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing({
                            course,
                            code: course.code,
                            name: course.name,
                            dept: course.department || "",
                            desc: course.description || "",
                            programId: course.program_id || "",
                            year: course.year || "",
                          }); }}
                          className="p-1.5 rounded hover:bg-amber-50 text-[#999] hover:text-amber-600 transition-colors"
                          title="Edit course"
                        >
                          <Pen className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }} className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors" title="Delete course">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-[#999]" /> : <ChevronDown className="w-4 h-4 text-[#999]" />}
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded: quizzes under this course */}
                {isExpanded && !isPendingAdd && !isPendingDelete && (
                  <div className="border-t border-[#e0e0e0] bg-[#f8f8f8] p-4">
                    <p className="text-xs font-semibold text-[#666] mb-3">Quizzes in this course</p>
                    {quizzes.length === 0 ? (
                      <p className="text-xs text-[#999] text-center py-4">
                        No quizzes saved to this course yet.
                        <br />
                        <span className="text-[10px]">Go to Quizzes → expand a quiz → Save to course.</span>
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {quizzes.map((quiz: any) => (
                          <div key={quiz.id} className="bg-white border border-[#e0e0e0] rounded p-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-[#333] truncate">{quiz.title}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[10px] text-[#999] font-mono">{quiz.share_code}</span>
                                {quiz.time_limit_minutes && (
                                  <span className="text-[10px] text-[#999] flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" /> {quiz.time_limit_minutes}m
                                  </span>
                                )}
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                  quiz.status === "published" ? "bg-green-50 text-green-700" :
                                  quiz.status === "draft" ? "bg-amber-50 text-amber-700" :
                                  "bg-slate-50 text-slate-600"
                                }`}>
                                  {quiz.status}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveQuizFromCourse(course.id, quiz.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors flex-shrink-0"
                              title="Remove from course"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Save bar */}
      {pending.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e0e0e0] shadow-lg z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
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
