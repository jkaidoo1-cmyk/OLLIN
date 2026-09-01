"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateQuizCode } from "@/lib/utils";
import { isDemoMode, addDemoQuiz, getDemoUser } from "@/lib/demo";
import { cleanText } from "@/lib/utils";
import { Quiz, Course, Profile } from "@/lib/types";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  Pencil,
  Trash2,
} from "lucide-react";

interface GeneratedQ {
  type: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  topic?: string;
  difficulty?: string;
}

export default function CreateQuizPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Course
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  // Material
  const [materialText, setMaterialText] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialType, setMaterialType] = useState<"paste" | "file">("paste");
  const [materialFileBase64, setMaterialFileBase64] = useState("");
  const [materialFileType, setMaterialFileType] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractWarning, setExtractWarning] = useState("");

  // Quiz config
  const [quizTitle, setQuizTitle] = useState("");
  const [quizMode, setQuizMode] = useState<"self" | "host" | "both">("host");

  const [questionCount, setQuestionCount] = useState(10);
  const [questionTypes, setQuestionTypes] = useState<string[]>(["multiple_choice"]);
  const [customInstructions, setCustomInstructions] = useState("");
  const [timeLimit, setTimeLimit] = useState<number | "">("");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Questions
  const [questions, setQuestions] = useState<GeneratedQ[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Publishing
  const [publishing, setPublishing] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch courses (filtered by student's program)
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const isDemo = isDemoMode();
        let programId: string | undefined;

        if (isDemo) {
          const user = getDemoUser();
          // In demo, user has no program assigned — show all courses
          programId = undefined;
        } else {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          if (supabase) {
            const { data: userData } = await supabase.auth.getUser();
            if (userData.user) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("program_id")
                .eq("id", userData.user.id)
                .single();
              programId = profile?.program_id || undefined;
            }
          }
        }

        const params = new URLSearchParams();
        if (programId) params.set("program_id", programId);

        const res = await fetch(`/api/courses?${params.toString()}`, {
          headers: isDemo ? { "x-demo-mode": "true" } : {},
        });
        const data = await res.json();
        let fetchedCourses = data.courses || [];

        // In demo mode, filter courses by student's current year
        if (isDemo) {
          const demoUser = getDemoUser();
          const studentYear = demoUser?.current_year;
          if (studentYear) {
            fetchedCourses = fetchedCourses.filter((c: any) => !c.year || c.year === studentYear);
          }
        }

        setCourses(fetchedCourses);
      } catch { /* ignore */ }
    };
    fetchCourses();
  }, []);

  // File upload → base64
  const handleFileUpload = async (file: File) => {
    setMaterialFile(file);
    setMaterialTitle(file.name.replace(/\.[^/.]+$/, ""));
    setExtractWarning("");

    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      setMaterialText(text);
      return;
    }

    setExtracting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      setMaterialFileBase64(base64);
      setMaterialFileType(file.type);
      setMaterialText(`[FILE:${file.name}]`);
    } catch (err) {
      setExtractWarning(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setExtracting(false);
    }
  };

  // Generate questions
  const handleGenerate = async () => {
    if (!materialText.trim()) return;
    setGenerating(true);
    setGenerateError("");

    try {
      const body: Record<string, unknown> = {
        question_count: questionCount,
        question_types: questionTypes.length > 0 ? questionTypes : ["multiple_choice"],
        mode: "generate",
      };

      if (customInstructions.trim()) {
        body.custom_instructions = customInstructions.trim();
      }

      if (materialFileBase64 && materialFileType) {
        body.file_data = materialFileBase64;
        body.file_type = materialFileType;
        body.file_name = materialFile?.name || "document";
      } else {
        body.material_text = materialText;
      }

      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate questions");
      }

      const data = await res.json();
      setQuestions(data.questions);
      if (data.analysis && !quizTitle && data.analysis.title) {
        setQuizTitle(data.analysis.title);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  // Publish
  const handlePublish = async () => {
    setPublishing(true);
    try {
      const shareCode = quizMode === "self" ? `SELF-${Date.now()}` : generateQuizCode();

      if (isDemoMode()) {
        const demoQuiz: Quiz = {
          id: `demo-quiz-${Date.now()}`,
          host_id: "demo-user-001",
          title: quizTitle || materialTitle || "Untitled Quiz",
          description: null,
          share_code: shareCode || `SELF-${Date.now()}`,
          time_limit_minutes: timeLimit || null,
          max_attempts: 1,
          show_answers_after: "after_completion",
          shuffle_questions: shuffleQuestions,
          shuffle_options: true,
          passing_score: 60,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          status: "published",
          course_id: selectedCourseId || null,
          material_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        // Convert GeneratedQ[] to Question[] for storage
        const demoQuestions = questions.map((q, idx) => ({
          id: `demo-q-${Date.now()}-${idx}`,
          quiz_id: demoQuiz.id,
          question_text: q.question,
          question_type: q.type as "multiple_choice" | "true_false" | "short_answer" | "fill_blank",
          options: q.options || null,
          correct_answer: q.correctAnswer,
          explanation: q.explanation,
          topic: q.topic || null,
          difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
          marks: 1,
          order_index: idx,
          created_at: new Date().toISOString(),
        }));
        addDemoQuiz(demoQuiz, demoQuestions);
        // Notify quiz creator
        const { addNotification } = await import("@/lib/demo");
        addNotification(
          "Quiz published",
          `Your quiz "${demoQuiz.title}" is now live and ready for participants.`,
          "quiz"
        );
        setGeneratedCode(shareCode);
        return;
      }

      // Real Supabase
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (supabase) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) { router.push("/login"); return; }

        const { data: quiz, error: quizError } = await supabase
          .from("quizzes")
          .insert({
            host_id: userData.user.id,
            title: quizTitle || materialTitle || "Untitled Quiz",
            description: null,
            share_code: shareCode,
            time_limit_minutes: timeLimit || null,
            show_answers_after: "after_completion",
            shuffle_questions: shuffleQuestions,
            shuffle_options: true,
            passing_score: 60,
            course_id: selectedCourseId || null,
            starts_at: startsAt ? new Date(startsAt).toISOString() : null,
            ends_at: endsAt ? new Date(endsAt).toISOString() : null,
            status: "published",
          })
          .select()
          .single();

        if (quizError) throw quizError;

        const questionInserts = questions.map((q, idx) => ({
          quiz_id: quiz.id,
          question_text: q.question,
          question_type: q.type,
          options: q.options || null,
          correct_answer: q.correctAnswer,
          explanation: q.explanation,
          topic: q.topic || null,
          difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
          marks: 1,
          order_index: idx,
        }));

        const { error: qError } = await supabase.from("questions").insert(questionInserts);
        if (qError) throw qError;
      }

      setGeneratedCode(shareCode);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to publish quiz");
    } finally {
      setPublishing(false);
    }
  };

  const updateQuestion = (idx: number, field: keyof GeneratedQ, value: string | string[]) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const deleteQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const addManualQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        type: "multiple_choice",
        question: "",
        options: ["", "", "", ""],
        correctAnswer: "0",
        explanation: "",
        topic: "",
        difficulty: "medium",
      },
    ]);
    setEditingIdx(questions.length);
  };

  const updateQuestionOptions = (idx: number, optIdx: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const opts = [...(updated[idx].options || [])];
      opts[optIdx] = value;
      updated[idx] = { ...updated[idx], options: opts };
      return updated;
    });
  };

  const setCorrectAnswer = (idx: number, optIdx: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], correctAnswer: String(optIdx) };
      return updated;
    });
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/quiz/${generatedCode}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // ── Published screen ──────────────────────
  if (generatedCode) {
    const isSelfStudy = generatedCode.startsWith("SELF-");
    return (
      <div className="max-w-md mx-auto text-center py-8">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-[#333]">
          {isSelfStudy ? "Quiz Ready" : "Quiz Published"}
        </h1>
        <p className="text-[#666] text-sm mt-1 mb-6">
          {isSelfStudy
            ? "Your quiz is ready. Start whenever you want."
            : "Share this code with your classmates."}
        </p>

        {!isSelfStudy && (
          <div className="bg-white border border-[#e0e0e0] rounded-lg p-6 mb-6">
            <p className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">Share Code</p>
            <div className="text-4xl font-bold font-mono tracking-widest text-green-600 mb-4">
              {generatedCode}
            </div>
            <button onClick={copyShareLink} className="btn-primary w-full py-2.5 text-xs">
              {copiedLink ? (
                <><Check className="w-4 h-4" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy Quiz Link</>
              )}
            </button>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Link href="/dashboard" className="btn-primary text-xs">Dashboard</Link>
          {(isSelfStudy || quizMode === "both") && (
            <Link
              href={`/quiz/${generatedCode}?guest=Me`}
              className="btn-primary text-xs"
            >
              Start quiz
            </Link>
          )}
          {quizMode === "host" && (
            <Link
              href={`/quiz/${generatedCode}?guest=Me`}
              className="btn-primary text-xs"
            >
              Preview
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#333]">Create quiz</h1>
        <p className="text-xs text-[#999] mt-0.5">Upload material, configure, and publish</p>
      </div>

      <div className="space-y-5">
        {/* Course */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
          <label className="block text-sm font-semibold mb-2 text-[#333]">Course</label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="input-field"
          >
            <option value="">Select a course...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
          {courses.length === 0 && (
            <p className="text-xs text-[#999] mt-1">No courses available. Ask admin to add courses.</p>
          )}
        </div>

        {/* Material */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
          <label className="block text-sm font-semibold mb-3 text-[#333]">Study material</label>

          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg mb-4 max-w-xs">
            <button
              onClick={() => setMaterialType("paste")}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                materialType === "paste" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Paste text
            </button>
            <button
              onClick={() => setMaterialType("file")}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                materialType === "file" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Upload file
            </button>
          </div>

          {materialType === "paste" ? (
            <div>
              <textarea
                value={materialText}
                onChange={(e) => setMaterialText(e.target.value)}
                placeholder="Paste lecture notes, textbook chapters, or study guides here..."
                rows={8}
                className="input-field text-sm resize-y"
              />
              {materialText && (
                <div className="flex justify-between items-center text-xs text-[#999] mt-1.5">
                  <span>{materialText.length.toLocaleString()} characters</span>
                  <span>{materialText.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div
                onClick={() => !extracting && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  extracting ? "border-green-300 bg-green-50/30" : "border-[#e0e0e0] hover:border-green-400"
                }`}
              >
                {extracting ? (
                  <div>
                    <Loader2 className="w-6 h-6 text-green-600 mx-auto mb-2 animate-spin" />
                    <p className="text-sm text-[#333]">Reading file...</p>
                  </div>
                ) : materialFile ? (
                  <div>
                    <FileText className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-[#333]">{materialFile.name}</p>
                    <p className="text-xs text-[#999] mt-0.5">{(materialFile.size / 1024).toFixed(1)} KB — Click to replace</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-6 h-6 text-[#999] mx-auto mb-2" />
                    <p className="text-sm text-[#333]">Click to upload or drag and drop</p>
                    <p className="text-xs text-[#999] mt-0.5">PDF, DOCX, or TXT</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />
              {extractWarning && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {extractWarning}
                </div>
              )}
              {materialFile && !extracting && materialFileBase64 && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> File ready
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quiz config */}
        <div className="bg-white border border-[#e0e0e0] rounded-lg p-5">
          <label className="block text-sm font-semibold mb-3 text-[#333]">Quiz settings</label>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Title</label>
              <input
                type="text"
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                placeholder={materialTitle || "e.g. Biology Chapter 4"}
                className="input-field text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Number of questions</label>
                <input
                  type="number"
                  value={questionCount}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > 0) setQuestionCount(val);
                  }}
                  min={1}
                  max={200}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Time limit (min)</label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value ? Number(e.target.value) : "")}
                  placeholder="None"
                  min={1}
                  max={180}
                  className="input-field text-sm"
                />
              </div>
            </div>

            {/* Question types */}
            <div>
              <label className="block text-xs font-medium text-[#666] mb-2">Question types</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "multiple_choice", label: "Multiple choice" },
                  { value: "true_false", label: "True / False" },
                  { value: "short_answer", label: "Short answer" },
                  { value: "fill_blank", label: "Fill in the blank" },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setQuestionTypes((prev) =>
                        prev.includes(t.value)
                          ? prev.filter((v) => v !== t.value)
                          : [...prev, t.value]
                      );
                    }}
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                      questionTypes.includes(t.value)
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-[#e0e0e0] bg-white text-[#666] hover:border-[#ccc]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom instructions */}
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Custom instructions (optional)</label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Focus on chapters 3-5, make questions harder, include more application-based questions..."
                rows={2}
                className="input-field text-sm resize-y"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#333]">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-3.5 h-3.5 accent-green-600 rounded"
              />
              Shuffle question order
            </label>
          </div>

          {/* Quiz mode selector */}
          <div className="mt-4 pt-4 border-t border-[#e0e0e0]">
            <label className="block text-xs font-medium text-[#666] mb-2">Who is this quiz for?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "self" as const, label: "Just me", desc: "Self-study" },
                { value: "host" as const, label: "Others", desc: "Share with class" },
                { value: "both" as const, label: "All of us", desc: "Me + others" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuizMode(opt.value)}
                  className={`py-2.5 px-2 rounded border text-center transition-colors ${
                    quizMode === opt.value
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-[#e0e0e0] bg-white text-[#666] hover:border-[#ccc]"
                  }`}
                >
                  <span className="block text-xs font-semibold">{opt.label}</span>
                  <span className="block text-[10px] text-[#999] mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start & End time — only for host/both modes */}
          {quizMode !== "self" && (
            <div className="mt-4 pt-4 border-t border-[#e0e0e0]">
              <label className="block text-xs font-medium text-[#666] mb-2">Schedule</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#999] mb-1">Start time</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="input-field text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#999] mb-1">End time</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    min={startsAt || undefined}
                    className="input-field text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#999] mt-1.5">Leave empty for no time restrictions</p>
            </div>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!materialText.trim() || generating}
          className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating questions...</>
          ) : (
            "Generate questions"
          )}
        </button>

        {generateError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {generateError}
          </div>
        )}

        {/* Generated questions */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#333]">{questions.length} questions generated</h2>
              <span className="text-xs text-[#999]">Edit or delete as needed</span>
            </div>

            {questions.map((q, idx) => (
              <div key={idx} className="bg-white border border-[#e0e0e0] rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>                  <div className="flex-1 min-w-0">
                      {editingIdx === idx ? (
                        <>
                          <input
                            type="text"
                            value={q.question}
                            onChange={(e) => updateQuestion(idx, "question", e.target.value)}
                            placeholder="Question text"
                            className="input-field mb-2 text-sm font-medium"
                          />
                          <select
                            value={q.type}
                            onChange={(e) => updateQuestion(idx, "type", e.target.value)}
                            className="input-field mb-2 text-xs"
                          >
                            <option value="multiple_choice">Multiple choice</option>
                            <option value="true_false">True / False</option>
                            <option value="short_answer">Short answer</option>
                            <option value="fill_blank">Fill in the blank</option>
                          </select>
                          {q.type === "multiple_choice" && q.options && (
                            <div className="space-y-1.5 mb-2">
                              {q.options.map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <button
                                    onClick={() => setCorrectAnswer(idx, oi)}
                                    className={`w-5 h-5 rounded-full border text-xs flex items-center justify-center flex-shrink-0 ${
                                      String(oi) === q.correctAnswer
                                        ? "border-green-500 bg-green-500 text-white"
                                        : "border-[#ccc] text-[#999]"
                                    }`}
                                    title="Mark as correct"
                                  >
                                    {String.fromCharCode(65 + oi)}
                                  </button>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => updateQuestionOptions(idx, oi, e.target.value)}
                                    placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                                    className="input-field text-xs flex-1"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          {q.type === "true_false" && (
                            <div className="flex gap-2 mb-2">
                              {["true", "false"].map((val) => (
                                <button
                                  key={val}
                                  onClick={() => updateQuestion(idx, "correctAnswer", val)}
                                  className={`flex-1 py-1.5 rounded border text-xs font-medium ${
                                    q.correctAnswer === val
                                      ? "border-green-500 bg-green-50 text-green-700"
                                      : "border-[#e0e0e0] text-[#666]"
                                  }`}
                                >
                                  {val === "true" ? "True" : "False"}
                                </button>
                              ))}
                            </div>
                          )}
                          {(q.type === "short_answer" || q.type === "fill_blank") && (
                            <input
                              type="text"
                              value={q.correctAnswer}
                              onChange={(e) => updateQuestion(idx, "correctAnswer", e.target.value)}
                              placeholder="Correct answer"
                              className="input-field text-xs mb-2"
                            />
                          )}
                          <input
                            type="text"
                            value={q.explanation}
                            onChange={(e) => updateQuestion(idx, "explanation", e.target.value)}
                            placeholder="Explanation (shown after submission)"
                            className="input-field text-xs"
                          />
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-sm text-[#333]">{cleanText(q.question)}</p>
                          <span className="inline-block text-[10px] px-1.5 py-0.5 bg-slate-100 text-[#666] rounded mt-1">
                            {q.type.replace(/_/g, " ")}
                          </span>
                          {q.options && q.type === "multiple_choice" && (
                            <div className="mt-1.5 space-y-0.5">
                              {q.options.map((opt, oi) => {
                                const isCorrect = String(oi) === q.correctAnswer;
                                return (
                                  <div
                                    key={oi}
                                    className={`text-xs px-2.5 py-1 rounded ${
                                      isCorrect ? "bg-green-50 text-green-700 font-medium" : "text-[#666]"
                                    }`}>
                                    {String.fromCharCode(65 + oi)}. {cleanText(opt)}
                                    {isCorrect && " ✓"}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {q.type === "true_false" && (
                            <p className="text-xs text-[#666] mt-1">
                              Answer: <span className="font-medium text-green-700">{q.correctAnswer === "true" ? "True" : "False"}</span>
                            </p>
                          )}
                          {(q.type === "short_answer" || q.type === "fill_blank") && q.correctAnswer && (
                            <p className="text-xs text-[#666] mt-1">
                              Answer: <span className="font-medium text-green-700">{cleanText(q.correctAnswer)}</span>
                            </p>
                          )}
                          {q.explanation && (
                            <p className="mt-1.5 text-xs text-[#666] bg-[#f8f8f8] rounded px-2.5 py-1.5">
                              {cleanText(q.explanation)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                      className="p-1.5 rounded hover:bg-slate-100 text-[#999] hover:text-[#333]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteQuestion(idx)}
                      className="p-1.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Add question manually */}
            <button
              onClick={addManualQuestion}
              className="w-full py-2 border border-dashed border-[#ccc] rounded-lg text-xs font-medium text-[#666] hover:border-green-400 hover:text-green-600 transition-colors"
            >
              + Add question manually
            </button>

            {/* Publish */}
            <button
              onClick={handlePublish}
              disabled={publishing || questions.length === 0}
              className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
            >
              {publishing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
              ) : (
                `Publish quiz (${questions.length} questions)`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
