"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, BookOpen, Save, X, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Course, Program, Quiz } from "@/lib/types";
import { getSavedQuizzes, removeSavedQuiz } from "@/lib/demo";

type PendingAction =
  | { type: "add"; course: Course }
  | { type: "delete"; courseId: string };

export default function AdminCoursesPage() {
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
  const [formError, setFormError] = useState("");

  const [pending, setPending] = useState<PendingAction[]>([]);
  const [saving, setSaving] = useState(false);

  const isDemo = typeof window !== "undefined" && localStorage.getItem("ollin_demo_user") !== null;

  useEffect(() => {
    fetchCourses();
    fetchPrograms();
  }, []);

  useEffect(() => {
    if (expandedCourseId) {
      loadCourseQuizzes(expandedCourseId);
    }
  }, [expandedCourseId]);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/courses", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const data = await res.json();
      setCourses(data.courses || []);
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

  const loadCourseQuizzes = async (courseId: string) => {
    try {
      // Fetch quizzes from the API
      const res = await fetch("/api/quizzes", {
        headers: isDemo ? { "x-demo-mode": "true" } : {},
      });
      const data = await res.json();
      const apiQuizzes = data.quizzes || [];

      // Also get client-side quizzes from localStorage (student-created)
      let clientQuizzes: any[] = [];
      try {
        const stored = localStorage.getItem("ollin_demo_quizzes");
        clientQuizzes = stored ? JSON.parse(stored) : [];
      } catch { /* ignore */ }

      // Merge: API quizzes + client quizzes (deduplicate by id)
      const allQuizzes = [...apiQuizzes];
      for (const cq of clientQuizzes) {
        if (!allQuizzes.some((q: any) => q.id === cq.id)) {
          allQuizzes.push(cq);
        }
      }

      // Get saved quiz associations
      const saved = getSavedQuizzes();
      const courseQuizIds = saved.filter((s) => s.course_id === courseId).map((s) => s.quiz_id);
      const matched = allQuizzes.filter((q: any) => courseQuizIds.includes(q.id));

      setCourseQuizzes((prev) => ({ ...prev, [courseId]: matched }));
    } catch { /* ignore */ }
  };

  const handleRemoveQuizFromCourse = (courseId: string, quizId: string) => {
    removeSavedQuiz(quizId, courseId);
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
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this course? (changes won't apply until you save)")) return;
    setPending((prev) => [...prev, { type: "delete", courseId: id }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isDemo) {
        let updated = [...courses];
        for (const action of pending) {
          if (action.type === "add") updated = [...updated, action.course];
          else if (action.type === "delete") updated = updated.filter((c) => c.id !== action.courseId);
        }
        setCourses(updated);
        for (const action of pending) {
          if (action.type === "add") {
            await fetch("/api/courses", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-demo-mode": "true" },
              body: JSON.stringify({ code: action.course.code, name: action.course.name, department: action.course.department, description: action.course.description, program_id: action.course.program_id }),
            });
          } else if (action.type === "delete") {
            await fetch(`/api/courses?id=${action.courseId}`, { method: "DELETE", headers: { "x-demo-mode": "true" } });
          }
        }
      } else {
        for (const action of pending) {
          if (action.type === "add") {
            await fetch("/api/courses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: action.course.code, name: action.course.name, department: action.course.department, description: action.course.description, program_id: action.course.program_id }),
            });
          } else if (action.type === "delete") {
            await fetch(`/api/courses?id=${action.courseId}`, { method: "DELETE" });
          }
        }
        await fetchCourses();
      }

      // Sync localStorage with server file for student-side compatibility
      if (isDemo) {
        try {
          const res2 = await fetch("/api/courses", { headers: { "x-demo-mode": "true" } });
          const data2 = await res2.json();
          localStorage.setItem("ollin_demo_courses", JSON.stringify(data2.courses || []));
        } catch { /* ignore */ }
      }

      const { addNotification } = await import("@/lib/demo");
      const adds = pending.filter((a) => a.type === "add").length;
      const deletes = pending.filter((a) => a.type === "delete").length;
      const parts: string[] = [];
      if (adds) parts.push(`${adds} course${adds > 1 ? "s" : ""} added`);
      if (deletes) parts.push(`${deletes} course${deletes > 1 ? "s" : ""} removed`);
      addNotification("Courses updated", parts.join(", ") + ".", "system");

      setPending([]);
    } finally {
      setSaving(false);
    }
  };

  const displayCourses = (() => {
    let result = [...courses];
    for (const action of pending) {
      if (action.type === "add") result.push(action.course);
      else if (action.type === "delete") result = result.filter((c) => c.id !== action.courseId);
    }
    return result;
  })();

  // Load quizzes for all expanded courses when they change
  useEffect(() => {
    displayCourses.forEach((course) => {
      if (!courseQuizzes[course.id]) {
        loadCourseQuizzes(course.id);
      }
    });
  }, [displayCourses.length]);

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#333]">Courses</h1>
          <p className="text-xs text-[#999] mt-0.5">{displayCourses.length} courses {pending.length > 0 && `(${pending.length} pending)`}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add course
        </button>
      </div>

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
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Description</label>
              <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description of the course" className="input-field text-sm" />
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
            const isPendingDelete = pending.some((a) => a.type === "delete" && a.courseId === course.id);
            const isExpanded = expandedCourseId === course.id;
            const quizzes = courseQuizzes[course.id] || [];

            return (
              <div key={course.id} className={`bg-white border rounded-lg overflow-hidden ${
                isPendingAdd ? "border-green-300 bg-green-50/30" :
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
                    {isPendingDelete && <span className="text-[10px] text-red-500 font-medium">REMOVED</span>}
                    {course.department && (
                      <span className="text-[10px] text-[#999] bg-slate-50 px-2 py-0.5 rounded border border-slate-100 hidden sm:inline">{course.department}</span>
                    )}
                    {!isPendingAdd && !isPendingDelete && (
                      <>
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
