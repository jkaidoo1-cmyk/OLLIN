/**
 * Unified Data Access Layer
 *
 * Works in local mode or Supabase mode.
 * Accepts a `local` flag so server-side API routes can pass it explicitly.
 * Client-side code can call without the flag (defaults to checking localStorage).
 */

import {
  Quiz,
  Question,
  QuizAttempt,
  AttemptAnswer,
  QuizStats,
  Course,
  Program,
} from "./types";
import {
  isLocalMode,
  getLocalQuizByCode,
  getLocalQuizById,
  getLocalQuizzes,
  getLocalQuestions,
  getLocalAttempts,
  addLocalQuiz,
  getLocalUser,
} from "./local";
import {
  serverGetLocalQuizByCode,
  serverGetLocalQuizById,
  serverGetLocalQuizzes,
  serverGetLocalQuestions,
  serverGetLocalAttempts,
  serverGetLocalCourses,
  serverGetLocalCourseById,
  serverGetLocalPrograms,
  serverGetLocalProgramById,
} from "./server-local";
import { generateQuizCode } from "./utils";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Server-side file persistence for local data
function getServerQuizzesPath() {
  return join(process.cwd(), ".ollin-quizzes.json");
}

function getServerQuestionsPath() {
  return join(process.cwd(), ".ollin-questions.json");
}

function getServerAttemptsPath() {
  return join(process.cwd(), ".ollin-attempts.json");
}

export function readServerQuizzes(): Quiz[] {
  const path = getServerQuizzesPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  return [];
}

export function writeServerQuizzes(quizzes: Quiz[]) {
  try {
    writeFileSync(getServerQuizzesPath(), JSON.stringify(quizzes, null, 2));
  } catch { /* read-only fs (Vercel) — Supabase is the persistent store */ }
}

export function readServerQuestions(): Question[] {
  const path = getServerQuestionsPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  return [];
}

export function writeServerQuestions(questions: Question[]) {
  try {
    writeFileSync(getServerQuestionsPath(), JSON.stringify(questions, null, 2));
  } catch { /* read-only fs (Vercel) */ }
}

export function readServerAttempts(): QuizAttempt[] {
  const path = getServerAttemptsPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  return [];
}

export function writeServerAttempts(attempts: QuizAttempt[]) {
  try {
    writeFileSync(getServerAttemptsPath(), JSON.stringify(attempts, null, 2));
  } catch { /* read-only fs (Vercel) */ }
}

// ─── Helpers ───────────────────────────────────────────

const isServer = typeof window === "undefined";

function checkLocal(local?: boolean): boolean {
  if (local !== undefined) return local;
  if (isServer) return false; // server routes must pass local flag explicitly
  return isLocalMode();
}

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

async function getServerSupabase() {
  const { createClient } = await import("@/lib/supabase/server");
  const client = await createClient();
  if (!client) {
    // No Supabase configured — every server path should be treated as
    // file-backed local storage rather than crashing with null.auth.
    throw new Error("NO_BACKEND");
  }
  return client;
}

// ─── Quiz Operations ───────────────────────────────────

export async function createQuiz(
  input: {
    title: string;
    description?: string;
    course_id?: string;
    time_limit_minutes?: number | null;
    max_attempts?: number;
    shuffle_questions?: boolean;
    passing_score?: number;
    questions: Array<{
      type: string;
      question: string;
      options?: string[];
      correctAnswer: string;
      explanation: string;
      topic?: string;
      difficulty?: string;
    }>;
  },
  local?: boolean
): Promise<{ quiz: Quiz; code: string }> {
  const shareCode = generateQuizCode();
  const isLocal = checkLocal(local);

  if (isLocal) {
    const user = getLocalUser();
    const quiz: Quiz = {
      id: `local-quiz-${Date.now()}`,
      host_id: user?.id || "anonymous",
      title: input.title,
      description: input.description || null,
      share_code: shareCode,
      time_limit_minutes: input.time_limit_minutes || null,
      max_attempts: input.max_attempts || 1,
      show_answers_after: "after_completion",
      shuffle_questions: input.shuffle_questions ?? true,
      shuffle_options: true,
      passing_score: input.passing_score || 60,
      starts_at: null,
      ends_at: null,
      status: "published",
      course_id: input.course_id || null,
      material_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (isServer) {
      // Server-side: persist quiz + questions to file
      const quizzes = readServerQuizzes();
      quizzes.unshift(quiz);
      writeServerQuizzes(quizzes);
      // Persist questions
      if (input.questions.length > 0) {
        const serverQuestions: Question[] = input.questions.map((q, idx) => ({
          id: `q-${Date.now()}-${idx}`,
          quiz_id: quiz.id,
          question_text: q.question,
          question_type: q.type as Question["question_type"],
          options: q.options || null,
          correct_answer: q.correctAnswer,
          explanation: q.explanation,
          topic: q.topic || null,
          difficulty: (q.difficulty || "medium") as "easy" | "medium" | "hard",
          marks: 1,
          order_index: idx,
          created_at: new Date().toISOString(),
        }));
        const allQuestions = readServerQuestions();
        allQuestions.push(...serverQuestions);
        writeServerQuestions(allQuestions);
      }
    } else {
      addLocalQuiz(quiz);
    }
    return { quiz, code: shareCode };
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      host_id: userData.user.id,
      title: input.title,
      description: input.description || null,
      share_code: shareCode,
      time_limit_minutes: input.time_limit_minutes || null,
      max_attempts: input.max_attempts || 1,
      show_answers_after: "after_completion",
      shuffle_questions: input.shuffle_questions ?? true,
      shuffle_options: true,
      passing_score: input.passing_score || 60,
      course_id: input.course_id || null,
      status: "published",
    })
    .select()
    .single();

  if (quizError) throw quizError;

  if (input.questions.length > 0) {
    const questionInserts = input.questions.map((q, idx) => ({
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

    const { error: qError } = await supabase
      .from("questions")
      .insert(questionInserts);
    if (qError) throw qError;
  }

  return { quiz, code: shareCode };
}

export async function getQuizByCode(
  code: string,
  local?: boolean
): Promise<Quiz | null> {
  if (checkLocal(local)) {
    if (isServer) {
      // Check file first (student-created quizzes), then hardcoded defaults
      const fileQuizzes = readServerQuizzes();
      const fromFile = fileQuizzes.find((q) => q.share_code === code);
      if (fromFile) return fromFile;
      return serverGetLocalQuizByCode(code) || null;
    }
    return getLocalQuizByCode(code) || null;
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("share_code", code)
    .single();

  if (error) return null;
  return data;
}

export async function getQuizById(
  id: string,
  local?: boolean
): Promise<Quiz | null> {
  if (checkLocal(local)) {
    if (isServer) {
      const fileQuizzes = readServerQuizzes();
      const fromFile = fileQuizzes.find((q) => q.id === id);
      if (fromFile) return fromFile;
      return serverGetLocalQuizById(id) || null;
    }
    return getLocalQuizById(id) || null;
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getUserQuizzes(
  local?: boolean
): Promise<Quiz[]> {
  if (checkLocal(local)) {
    if (isServer) {
      // Return hardcoded defaults + file-stored quizzes
      const fileQuizzes = readServerQuizzes();
      const ids = new Set(fileQuizzes.map((q) => q.id));
      const defaults = serverGetLocalQuizzes().filter((q) => !ids.has(q.id));
      return [...fileQuizzes, ...defaults];
    }
    return getLocalQuizzes();
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("host_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

export async function deleteQuiz(
  id: string,
  local?: boolean
): Promise<void> {
  if (checkLocal(local)) {
    if (isServer) {
      const quizzes = readServerQuizzes().filter((q) => q.id !== id);
      writeServerQuizzes(quizzes);
      // Also delete associated questions to prevent orphaned data
      const questions = readServerQuestions().filter((q) => q.quiz_id !== id);
      writeServerQuestions(questions);
      return;
    }
    const quizzes = getLocalQuizzes().filter((q) => q.id !== id);
    localStorage.setItem("ollin_local_quizzes", JSON.stringify(quizzes));
    return;
  }

  const supabase = await getServerSupabase();
  await supabase.from("quizzes").delete().eq("id", id);
}

// ─── Question Operations ───────────────────────────────

export async function getQuizQuestions(
  quizId: string,
  local?: boolean
): Promise<Question[]> {
  if (checkLocal(local)) {
    if (isServer) {
      // Check server file first, then hardcoded defaults
      const fileQuestions = readServerQuestions().filter((q) => q.quiz_id === quizId);
      if (fileQuestions.length > 0) return fileQuestions;
      return serverGetLocalQuestions(quizId);
    }
    return getLocalQuestions(quizId);
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (error) return [];
  return data || [];
}

// ─── Attempt Operations ────────────────────────────────

export async function startAttempt(
  quizId: string,
  participantName?: string,
  local?: boolean
): Promise<QuizAttempt> {
  if (checkLocal(local)) {
    const quiz = isServer ? serverGetLocalQuizById(quizId) : getLocalQuizById(quizId);
    const questions = isServer ? serverGetLocalQuestions(quizId) : getLocalQuestions(quizId);
    const attempt: QuizAttempt = {
      id: `local-att-${Date.now()}`,
      quiz_id: quizId,
      participant_id: null,
      participant_name: participantName || "Local Student",
      started_at: new Date().toISOString(),
      completed_at: null,
      time_taken_seconds: null,
      total_questions: questions.length || quiz?.time_limit_minutes || 0,
      correct_answers: 0,
      score_percentage: 0,
      marks_earned: 0,
      marks_total: 0,
      status: "in_progress",
      created_at: new Date().toISOString(),
    };
    return attempt;
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const questions = await getQuizQuestions(quizId, false);

  const { data, error } = await supabase
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      participant_id: userData.user?.id || null,
      participant_name: participantName || null,
      total_questions: questions.length,
      status: "in_progress",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Case-insensitive, whitespace-trimmed answer comparison. */
function normalizeAnswer(v: string): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Resolve which quiz an attempt belongs to (for grading + window checks). */
export async function getAttemptQuizId(attemptId: string, local?: boolean): Promise<string | null> {
  if (checkLocal(local)) {
    // Local attempts encode nothing — return null; grading falls back to empty set.
    const attempts = isServer ? readServerAttempts() : [];
    const found = attempts.find((a) => a.id === attemptId);
    return found?.quiz_id ?? null;
  }
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("quiz_attempts")
    .select("quiz_id")
    .eq("id", attemptId)
    .single();
  return data?.quiz_id ?? null;
}

export async function saveAnswer(
  attemptId: string,
  questionId: string,
  selectedAnswer: string,
  isCorrect: boolean,
  marksAwarded: number,
  local?: boolean
): Promise<void> {
  if (checkLocal(local)) return;

  const supabase = await getServerSupabase();
  await supabase.from("attempt_answers").upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      selected_answer: selectedAnswer,
      is_correct: isCorrect,
      marks_awarded: marksAwarded,
    },
    { onConflict: "attempt_id,question_id" }
  );
}

export async function submitAttempt(
  attemptId: string,
  answers: Array<{
    question_id: string;
    selected_answer: string;
    is_correct?: boolean;
    marks_awarded?: number;
  }>,
  local?: boolean,
  quizIdHint?: string | null
): Promise<QuizAttempt> {
  // ── Server-side grading ─────────────────────────────────
  // Correctness and marks are computed HERE from the stored questions.
  // Client-sent is_correct/marks_awarded are ignored so participants can't
  // grade their own submissions.
  const gradeAnswers = async (): Promise<
    Array<{ question_id: string; selected_answer: string; is_correct: boolean; marks_awarded: number }>
  > => {
    const answeredIds = new Set(answers.map((a) => a.question_id));
    const quizId = quizIdHint || (await getAttemptQuizId(attemptId, local)) || "";
    const allQuestions = await getQuizQuestions(quizId, local);
    const questions = allQuestions.filter((q) => answeredIds.has(q.id));
    return answers.map((a) => {
      const q = questions.find((qq) => qq.id === a.question_id);
      const isCorrect = !!q && normalizeAnswer(a.selected_answer) === normalizeAnswer(q.correct_answer);
      return {
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        is_correct: isCorrect,
        marks_awarded: isCorrect ? (q?.marks ?? 1) : 0,
      };
    });
  };

  if (checkLocal(local)) {
    const graded = await gradeAnswers();
    const correct = graded.filter((a) => a.is_correct).length;
    const total = graded.length;
    const attempt: QuizAttempt = {
      id: attemptId,
      quiz_id: "",
      participant_id: null,
      participant_name: "Local Student",
      started_at: new Date(Date.now() - 600000).toISOString(),
      completed_at: new Date().toISOString(),
      time_taken_seconds: 600,
      total_questions: total,
      correct_answers: correct,
      score_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      marks_earned: graded.reduce((s, a) => s + a.marks_awarded, 0),
      marks_total: total,
      status: "completed",
      created_at: new Date().toISOString(),
    };
    return attempt;
  }

  const supabase = await getServerSupabase();

  const graded = await gradeAnswers();

  // Save all answers (graded server-side)
  if (graded.length > 0) {
    const answerInserts = graded.map((a) => ({
      attempt_id: attemptId,
      question_id: a.question_id,
      selected_answer: a.selected_answer,
      is_correct: a.is_correct,
      marks_awarded: a.marks_awarded,
    }));
    await supabase.from("attempt_answers").upsert(answerInserts, {
      onConflict: "attempt_id,question_id",
    });
  }

  const correct = graded.filter((a) => a.is_correct).length;
  const total = graded.length;
  const marksEarned = graded.reduce((s, a) => s + a.marks_awarded, 0);

  const { data, error } = await supabase
    .from("quiz_attempts")
    .update({
      completed_at: new Date().toISOString(),
      time_taken_seconds: Math.round(
        (Date.now() - new Date().getTime()) / 1000
      ),
      correct_answers: correct,
      score_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      marks_earned: marksEarned,
      marks_total: total,
      status: "completed",
    })
    .eq("id", attemptId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAttemptAnswers(
  attemptId: string,
  local?: boolean
): Promise<AttemptAnswer[]> {
  if (checkLocal(local)) return [];

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("attempt_answers")
    .select("*")
    .eq("attempt_id", attemptId);

  if (error) return [];
  return data || [];
}

export async function getQuizAttempts(
  quizId: string,
  local?: boolean
): Promise<QuizAttempt[]> {
  if (checkLocal(local)) {
    return isServer ? serverGetLocalAttempts(quizId) : getLocalAttempts(quizId);
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}// ─── Program Operations ───────────────────────────────

export async function getPrograms(local?: boolean): Promise<Program[]> {
  if (checkLocal(local)) {
    if (isServer) return serverGetLocalPrograms();
    // Client-side: read from localStorage (local.ts has getLocalPrograms)
    const { getLocalPrograms } = await import("./local");
    return getLocalPrograms();
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .order("code", { ascending: true });

  if (error) return [];
  return data || [];
}

export async function getProgramById(
  id: string,
  local?: boolean
): Promise<Program | null> {
  if (checkLocal(local)) {
    return isServer ? serverGetLocalProgramById(id) || null : null;
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createProgram(
  input: { code: string; name: string; department?: string; description?: string },
  local?: boolean
): Promise<Program> {
  if (checkLocal(local)) {
    const program: Program = {
      id: `local-program-${Date.now()}`,
      code: input.code,
      name: input.name,
      department: input.department || null,
      description: input.description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!isServer) {
      const { addLocalProgram } = await import("./local");
      addLocalProgram(program);
    }
    return program;
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("programs")
    .insert({
      code: input.code.toUpperCase(),
      name: input.name,
      department: input.department || null,
      description: input.description || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProgram(
  input: { id: string; code?: string; name?: string; department?: string | null; description?: string | null },
  local?: boolean
): Promise<Program> {
  if (checkLocal(local)) {
    if (isServer) {
      // Server-side file update
      const path = join(process.cwd(), ".ollin-programs.json");
      if (existsSync(path)) {
        const programs = JSON.parse(readFileSync(path, "utf-8"));
        const idx = programs.findIndex((p: any) => p.id === input.id);
        if (idx >= 0) {
          if (input.code) programs[idx].code = input.code;
          if (input.name) programs[idx].name = input.name;
          if (input.department !== undefined) programs[idx].department = input.department;
          if (input.description !== undefined) programs[idx].description = input.description;
          programs[idx].updated_at = new Date().toISOString();
          try { writeFileSync(path, JSON.stringify(programs, null, 2)); } catch { /* read-only fs */ }
          return programs[idx];
        }
      }
      throw new Error("Program not found");
    }
    // Client-side: update localStorage local data
    const { getLocalPrograms } = await import("./local");
    const programs = getLocalPrograms();
    const idx = programs.findIndex((p) => p.id === input.id);
    if (idx < 0) throw new Error("Program not found");
    if (input.code) programs[idx].code = input.code;
    if (input.name) programs[idx].name = input.name;
    if (input.department !== undefined) programs[idx].department = input.department;
    if (input.description !== undefined) programs[idx].description = input.description;
    programs[idx].updated_at = new Date().toISOString();
    localStorage.setItem("ollin_local_programs", JSON.stringify(programs));
    return programs[idx];
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("programs")
    .update({
      ...(input.code ? { code: input.code.toUpperCase() } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .eq("id", input.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProgram(id: string, local?: boolean): Promise<void> {
  if (checkLocal(local)) {
    if (isServer) return;
    const { getLocalPrograms } = await import("./local");
    const programs = getLocalPrograms().filter((p) => p.id !== id);
    localStorage.setItem("ollin_local_programs", JSON.stringify(programs));
    return;
  }
  const supabase = await getServerSupabase();
  await supabase.from("programs").delete().eq("id", id);
}

// ─── Course Operations ─────────────────────────────────

export async function getCourses(
  local?: boolean,
  programId?: string
): Promise<Course[]> {
  if (checkLocal(local)) {
    if (isServer) {
      const all = serverGetLocalCourses();
      if (!programId) return all;
      return all.filter((c) => c.program_id === programId || !c.program_id);
    }
    // Client-side: read from localStorage
    const { getLocalCourses } = await import("./local");
    const all = getLocalCourses();
    if (!programId) return all;
    return all.filter((c) => c.program_id === programId || !c.program_id);
  }

  const supabase = await getServerSupabase();
  let query = supabase.from("courses").select("*").order("code", { ascending: true });
  if (programId) {
    // Include courses for this program AND general courses (no program)
    query = query.or(`program_id.eq.${programId},program_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function getCourseById(
  id: string,
  local?: boolean
): Promise<Course | null> {
  if (checkLocal(local)) {
    return isServer ? serverGetLocalCourseById(id) || null : null;
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createCourse(
  input: { code: string; name: string; description?: string; department?: string; program_id?: string; year?: number | null },
  local?: boolean
): Promise<Course> {
  if (checkLocal(local)) {
    const course: Course = {
      id: `local-course-${Date.now()}`,
      code: input.code,
      name: input.name,
      description: input.description || null,
      department: input.department || null,
      program_id: input.program_id || null,
      year: input.year || null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!isServer) {
      const { addLocalCourse } = await import("./local");
      addLocalCourse(course);
    }
    return course;
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description || null,
      department: input.department || null,
      program_id: input.program_id || null,
      year: input.year || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCourse(
  input: { id: string; code?: string; name?: string; description?: string | null; department?: string | null; program_id?: string | null; year?: number | null },
  local?: boolean
): Promise<Course> {
  if (checkLocal(local)) {
    if (isServer) {
      const path = join(process.cwd(), ".ollin-courses.json");
      if (existsSync(path)) {
        const courses = JSON.parse(readFileSync(path, "utf-8"));
        const idx = courses.findIndex((c: any) => c.id === input.id);
        if (idx >= 0) {
          if (input.code) courses[idx].code = input.code;
          if (input.name) courses[idx].name = input.name;
          if (input.description !== undefined) courses[idx].description = input.description;
          if (input.department !== undefined) courses[idx].department = input.department;
          if (input.program_id !== undefined) courses[idx].program_id = input.program_id;
          if (input.year !== undefined) courses[idx].year = input.year;
          courses[idx].updated_at = new Date().toISOString();
          try { writeFileSync(path, JSON.stringify(courses, null, 2)); } catch { /* read-only fs */ }
          return courses[idx];
        }
      }
      throw new Error("Course not found");
    }
    const { getLocalCourses } = await import("./local");
    const courses = getLocalCourses();
    const idx = courses.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new Error("Course not found");
    if (input.code) courses[idx].code = input.code;
    if (input.name) courses[idx].name = input.name;
    if (input.description !== undefined) courses[idx].description = input.description;
    if (input.department !== undefined) courses[idx].department = input.department;
    if (input.program_id !== undefined) courses[idx].program_id = input.program_id;
    if (input.year !== undefined) courses[idx].year = input.year;
    courses[idx].updated_at = new Date().toISOString();
    localStorage.setItem("ollin_local_courses", JSON.stringify(courses));
    return courses[idx];
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("courses")
    .update({
      ...(input.code ? { code: input.code.toUpperCase() } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.program_id !== undefined ? { program_id: input.program_id } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
    })
    .eq("id", input.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCourse(
  id: string,
  local?: boolean
): Promise<void> {
  if (checkLocal(local)) {
    if (isServer) return;
    const { getLocalCourses } = await import("./local");
    const courses = getLocalCourses().filter((c) => c.id !== id);
    localStorage.setItem("ollin_local_courses", JSON.stringify(courses));
    return;
  }

  const supabase = await getServerSupabase();
  await supabase.from("courses").delete().eq("id", id);
}

export async function getUserAttempts(
  local?: boolean
): Promise<QuizAttempt[]> {
  if (checkLocal(local)) return [];

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("participant_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

// ─── Host Analytics ────────────────────────────────────

export async function getQuizStats(
  quizId: string,
  local?: boolean
): Promise<QuizStats | null> {
  const quiz = await getQuizById(quizId, local);
  if (!quiz) return null;

  const attempts = await getQuizAttempts(quizId, local);
  const questions = await getQuizQuestions(quizId, local);

  const completedAttempts = attempts.filter((a) => a.status === "completed");
  const scores = completedAttempts.map((a) => a.score_percentage);
  const times = completedAttempts
    .map((a) => a.time_taken_seconds)
    .filter((t): t is number => t !== null);

  const questionStats = questions.map((q) => ({
    question_id: q.id,
    question_text: q.question_text,
    correct_percentage: 0,
    total_answers: 0,
  }));

  if (checkLocal(local)) {
    return {
      quiz,
      total_attempts: attempts.length,
      completed_attempts: completedAttempts.length,
      average_score:
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0,
      average_time_seconds:
        times.length > 0
          ? times.reduce((a, b) => a + b, 0) / times.length
          : 0,
      highest_score: scores.length > 0 ? Math.max(...scores) : 0,
      lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
      question_stats: questionStats,
    };
  }

  const supabase = await getServerSupabase();
  const { data: allAnswers } = await supabase
    .from("attempt_answers")
    .select("question_id, is_correct")
    .in(
      "attempt_id",
      completedAttempts.map((a) => a.id)
    );

  const answerMap = new Map<string, { correct: number; total: number }>();
  for (const ans of allAnswers || []) {
    const prev = answerMap.get(ans.question_id) || { correct: 0, total: 0 };
    prev.total += 1;
    if (ans.is_correct) prev.correct += 1;
    answerMap.set(ans.question_id, prev);
  }

  const enrichedQuestionStats = questionStats.map((qs) => {
    const stats = answerMap.get(qs.question_id);
    return {
      ...qs,
      total_answers: stats?.total || 0,
      correct_percentage:
        stats && stats.total > 0
          ? Math.round((stats.correct / stats.total) * 100)
          : 0,
    };
  });

  return {
    quiz,
    total_attempts: attempts.length,
    completed_attempts: completedAttempts.length,
    average_score:
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0,
    average_time_seconds:
      times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0,
    highest_score: scores.length > 0 ? Math.max(...scores) : 0,
    lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
    question_stats: enrichedQuestionStats,
  };
}
