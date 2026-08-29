/**
 * Unified Data Access Layer
 *
 * Works in demo mode or Supabase mode.
 * Accepts a `demo` flag so server-side API routes can pass it explicitly.
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
  isDemoMode,
  getDemoQuizByCode,
  getDemoQuizById,
  getDemoQuizzes,
  getDemoQuestions,
  getDemoAttempts,
  addDemoQuiz,
  getDemoUser,
} from "./demo";
import {
  serverGetDemoQuizByCode,
  serverGetDemoQuizById,
  serverGetDemoQuizzes,
  serverGetDemoQuestions,
  serverGetDemoAttempts,
  serverGetDemoCourses,
  serverGetDemoCourseById,
  serverGetDemoPrograms,
  serverGetDemoProgramById,
} from "./server-demo";
import { generateQuizCode } from "./utils";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Server-side file persistence for demo data
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

function writeServerQuizzes(quizzes: Quiz[]) {
  writeFileSync(getServerQuizzesPath(), JSON.stringify(quizzes, null, 2));
}

export function readServerQuestions(): Question[] {
  const path = getServerQuestionsPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  return [];
}

function writeServerQuestions(questions: Question[]) {
  writeFileSync(getServerQuestionsPath(), JSON.stringify(questions, null, 2));
}

export function readServerAttempts(): QuizAttempt[] {
  const path = getServerAttemptsPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  return [];
}

export function writeServerAttempts(attempts: QuizAttempt[]) {
  writeFileSync(getServerAttemptsPath(), JSON.stringify(attempts, null, 2));
}

// ─── Helpers ───────────────────────────────────────────

const isServer = typeof window === "undefined";

function checkDemo(demo?: boolean): boolean {
  if (demo !== undefined) return demo;
  if (isServer) return false; // server routes must pass demo flag explicitly
  return isDemoMode();
}

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

async function getServerSupabase() {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
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
  demo?: boolean
): Promise<{ quiz: Quiz; code: string }> {
  const shareCode = generateQuizCode();
  const isDemo = checkDemo(demo);

  if (isDemo) {
    const user = getDemoUser();
    const quiz: Quiz = {
      id: `demo-quiz-${Date.now()}`,
      host_id: user?.id || "demo-user-001",
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
      addDemoQuiz(quiz);
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
  demo?: boolean
): Promise<Quiz | null> {
  if (checkDemo(demo)) {
    if (isServer) {
      // Check file first (student-created quizzes), then hardcoded defaults
      const fileQuizzes = readServerQuizzes();
      const fromFile = fileQuizzes.find((q) => q.share_code === code);
      if (fromFile) return fromFile;
      return serverGetDemoQuizByCode(code) || null;
    }
    return getDemoQuizByCode(code) || null;
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
  demo?: boolean
): Promise<Quiz | null> {
  if (checkDemo(demo)) {
    if (isServer) {
      const fileQuizzes = readServerQuizzes();
      const fromFile = fileQuizzes.find((q) => q.id === id);
      if (fromFile) return fromFile;
      return serverGetDemoQuizById(id) || null;
    }
    return getDemoQuizById(id) || null;
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
  demo?: boolean
): Promise<Quiz[]> {
  if (checkDemo(demo)) {
    if (isServer) {
      // Return hardcoded defaults + file-stored quizzes
      const fileQuizzes = readServerQuizzes();
      const ids = new Set(fileQuizzes.map((q) => q.id));
      const defaults = serverGetDemoQuizzes().filter((q) => !ids.has(q.id));
      return [...fileQuizzes, ...defaults];
    }
    return getDemoQuizzes();
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
  demo?: boolean
): Promise<void> {
  if (checkDemo(demo)) {
    if (isServer) {
      const quizzes = readServerQuizzes().filter((q) => q.id !== id);
      writeServerQuizzes(quizzes);
      // Also delete associated questions to prevent orphaned data
      const questions = readServerQuestions().filter((q) => q.quiz_id !== id);
      writeServerQuestions(questions);
      return;
    }
    const quizzes = getDemoQuizzes().filter((q) => q.id !== id);
    localStorage.setItem("ollin_demo_quizzes", JSON.stringify(quizzes));
    return;
  }

  const supabase = await getServerSupabase();
  await supabase.from("quizzes").delete().eq("id", id);
}

// ─── Question Operations ───────────────────────────────

export async function getQuizQuestions(
  quizId: string,
  demo?: boolean
): Promise<Question[]> {
  if (checkDemo(demo)) {
    if (isServer) {
      // Check server file first, then hardcoded defaults
      const fileQuestions = readServerQuestions().filter((q) => q.quiz_id === quizId);
      if (fileQuestions.length > 0) return fileQuestions;
      return serverGetDemoQuestions(quizId);
    }
    return getDemoQuestions(quizId);
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
  demo?: boolean
): Promise<QuizAttempt> {
  if (checkDemo(demo)) {
    const quiz = isServer ? serverGetDemoQuizById(quizId) : getDemoQuizById(quizId);
    const questions = isServer ? serverGetDemoQuestions(quizId) : getDemoQuestions(quizId);
    const attempt: QuizAttempt = {
      id: `demo-att-${Date.now()}`,
      quiz_id: quizId,
      participant_id: null,
      participant_name: participantName || "Demo Student",
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

export async function saveAnswer(
  attemptId: string,
  questionId: string,
  selectedAnswer: string,
  isCorrect: boolean,
  marksAwarded: number,
  demo?: boolean
): Promise<void> {
  if (checkDemo(demo)) return;

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
    is_correct: boolean;
    marks_awarded: number;
  }>,
  demo?: boolean
): Promise<QuizAttempt> {
  if (checkDemo(demo)) {
    const correct = answers.filter((a) => a.is_correct).length;
    const total = answers.length;
    const attempt: QuizAttempt = {
      id: attemptId,
      quiz_id: "",
      participant_id: null,
      participant_name: "Demo Student",
      started_at: new Date(Date.now() - 600000).toISOString(),
      completed_at: new Date().toISOString(),
      time_taken_seconds: 600,
      total_questions: total,
      correct_answers: correct,
      score_percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      marks_earned: answers.reduce((s, a) => s + a.marks_awarded, 0),
      marks_total: total,
      status: "completed",
      created_at: new Date().toISOString(),
    };
    return attempt;
  }

  const supabase = await getServerSupabase();

  // Save all answers
  if (answers.length > 0) {
    const answerInserts = answers.map((a) => ({
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

  const correct = answers.filter((a) => a.is_correct).length;
  const total = answers.length;
  const marksEarned = answers.reduce((s, a) => s + a.marks_awarded, 0);

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
  demo?: boolean
): Promise<AttemptAnswer[]> {
  if (checkDemo(demo)) return [];

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
  demo?: boolean
): Promise<QuizAttempt[]> {
  if (checkDemo(demo)) {
    return isServer ? serverGetDemoAttempts(quizId) : getDemoAttempts(quizId);
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

export async function getPrograms(demo?: boolean): Promise<Program[]> {
  if (checkDemo(demo)) {
    if (isServer) return serverGetDemoPrograms();
    // Client-side: read from localStorage (demo.ts has getDemoPrograms)
    const { getDemoPrograms } = await import("./demo");
    return getDemoPrograms();
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
  demo?: boolean
): Promise<Program | null> {
  if (checkDemo(demo)) {
    return isServer ? serverGetDemoProgramById(id) || null : null;
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
  demo?: boolean
): Promise<Program> {
  if (checkDemo(demo)) {
    const program: Program = {
      id: `demo-program-${Date.now()}`,
      code: input.code,
      name: input.name,
      department: input.department || null,
      description: input.description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!isServer) {
      const { addDemoProgram } = await import("./demo");
      addDemoProgram(program);
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

export async function deleteProgram(id: string, demo?: boolean): Promise<void> {
  if (checkDemo(demo)) {
    if (isServer) return;
    const { getDemoPrograms } = await import("./demo");
    const programs = getDemoPrograms().filter((p) => p.id !== id);
    localStorage.setItem("ollin_demo_programs", JSON.stringify(programs));
    return;
  }
  const supabase = await getServerSupabase();
  await supabase.from("programs").delete().eq("id", id);
}

// ─── Course Operations ─────────────────────────────────

export async function getCourses(
  demo?: boolean,
  programId?: string
): Promise<Course[]> {
  if (checkDemo(demo)) {
    if (isServer) {
      const all = serverGetDemoCourses();
      if (!programId) return all;
      return all.filter((c) => c.program_id === programId || !c.program_id);
    }
    // Client-side: read from localStorage
    const { getDemoCourses } = await import("./demo");
    const all = getDemoCourses();
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
  demo?: boolean
): Promise<Course | null> {
  if (checkDemo(demo)) {
    return isServer ? serverGetDemoCourseById(id) || null : null;
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
  input: { code: string; name: string; description?: string; department?: string; program_id?: string },
  demo?: boolean
): Promise<Course> {
  if (checkDemo(demo)) {
    const course: Course = {
      id: `demo-course-${Date.now()}`,
      code: input.code,
      name: input.name,
      description: input.description || null,
      department: input.department || null,
      program_id: input.program_id || null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!isServer) {
      const { addDemoCourse } = await import("./demo");
      addDemoCourse(course);
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
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCourse(
  id: string,
  demo?: boolean
): Promise<void> {
  if (checkDemo(demo)) {
    if (isServer) return;
    const { getDemoCourses } = await import("./demo");
    const courses = getDemoCourses().filter((c) => c.id !== id);
    localStorage.setItem("ollin_demo_courses", JSON.stringify(courses));
    return;
  }

  const supabase = await getServerSupabase();
  await supabase.from("courses").delete().eq("id", id);
}

export async function getUserAttempts(
  demo?: boolean
): Promise<QuizAttempt[]> {
  if (checkDemo(demo)) return [];

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
  demo?: boolean
): Promise<QuizStats | null> {
  const quiz = await getQuizById(quizId, demo);
  if (!quiz) return null;

  const attempts = await getQuizAttempts(quizId, demo);
  const questions = await getQuizQuestions(quizId, demo);

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

  if (checkDemo(demo)) {
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
