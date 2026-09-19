"use client";

import { Quiz, Question, QuizAttempt, Course, Program } from "./types";

const DEMO_USER_KEY = "ollin_demo_user";
const DEMO_QUIZZES_KEY = "ollin_demo_quizzes";
const DEMO_QUESTIONS_KEY = "ollin_demo_questions";

export interface DemoUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  password: string;
  current_year?: number;
}

const DEMO_USERS_DEFAULT: DemoUser[] = [
  {
    id: "admin-001",
    email: "jkaidoo1@mail.com",
    full_name: "Admin User",
    role: "admin",
    password: "OllinAdmin1598",
  },
];

const DEMO_USERS_KEY = "ollin_demo_users";

export function getDemoUsers(): DemoUser[] {
  if (typeof window === "undefined") return DEMO_USERS_DEFAULT;
  const stored = localStorage.getItem(DEMO_USERS_KEY);
  if (stored) {
    try {
      const users: DemoUser[] = JSON.parse(stored);
      // Always sync built-in accounts with current defaults (passwords may change between deploys)
      let changed = false;
      for (const defaultUser of DEMO_USERS_DEFAULT) {
        const existing = users.find((u) => u.id === defaultUser.id);
        if (existing && existing.password !== defaultUser.password) {
          existing.password = defaultUser.password;
          changed = true;
        }
      }
      if (changed) localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
      return users;
    } catch { /* ignore */ }
  }
  // Initialize with defaults
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(DEMO_USERS_DEFAULT));
  return DEMO_USERS_DEFAULT;
}

export function addDemoUser(user: DemoUser): void {
  const users = getDemoUsers();
  users.push(user);
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
}

export function removeDemoUser(userId: string): void {
  const users = getDemoUsers().filter((u) => u.id !== userId);
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
}

// All-users list includes admin + students (for admin panel display)
export function getAllDemoUsers() {
  return getDemoUsers();
}

const DEMO_PROGRAMS: Program[] = [];

const DEMO_COURSES: Course[] = [];

const DEMO_QUIZZES: Quiz[] = [];

const DEMO_QUESTIONS: Question[] = [];

const DEMO_ATTEMPTS: QuizAttempt[] = [];

// ─── Demo Mode API ─────────────────

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_USER_KEY) !== null;
}

export function getDemoUser(): DemoUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(DEMO_USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function enableDemoMode(user?: DemoUser): DemoUser {
  const u = user || DEMO_USERS_DEFAULT[1]; // default to student
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
  // Only initialize quizzes if none exist yet — don't overwrite student-created quizzes
  if (!localStorage.getItem(DEMO_QUIZZES_KEY)) {
    localStorage.setItem(DEMO_QUIZZES_KEY, JSON.stringify(DEMO_QUIZZES));
  }
  // Ensure the logged-in user exists in the client users list (so the profile
  // year selector and admin edits can find them, even for admin-created accounts).
  const users = getDemoUsers();
  const existing = users.find((x) => x.id === u.id);
  if (existing) {
    existing.email = u.email;
    existing.full_name = u.full_name;
    existing.role = u.role;
    if (u.current_year !== undefined) existing.current_year = u.current_year;
  } else {
    users.push({ ...u, password: u.password || "" });
  }
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
  return u;
}

/**
 * Authenticate a demo user by email + password.
 * Returns the user if credentials match, null otherwise.
 */
export function authenticateDemoUser(email: string, password: string): DemoUser | null {
  const users = getDemoUsers();
  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  return user || null;
}

export function disableDemoMode(): void {
  localStorage.removeItem(DEMO_USER_KEY);
  localStorage.removeItem(DEMO_QUIZZES_KEY);
}

export function getDemoQuizzes(): Quiz[] {
  const stored = localStorage.getItem(DEMO_QUIZZES_KEY);
  return stored ? JSON.parse(stored) : DEMO_QUIZZES;
}

export function getDemoQuizById(id: string): Quiz | undefined {
  return getDemoQuizzes().find((q) => q.id === id);
}

export function getDemoQuizByCode(code: string): Quiz | undefined {
  return getDemoQuizzes().find((q) => q.share_code === code);
}

export function getDemoQuestions(quizId: string): Question[] {
  if (quizId === "demo-quiz-001") return DEMO_QUESTIONS;
  const stored = getDemoAllQuestions();
  return stored.filter((q) => q.quiz_id === quizId);
}

export function getDemoAttempts(quizId: string): QuizAttempt[] {
  // Combine hardcoded demo attempts + saved attempts from localStorage
  const saved = getDemoAttemptsForQuiz(quizId).map((a) => ({
    id: a.id,
    quiz_id: a.quiz_id,
    participant_id: null,
    participant_name: a.participant_name,
    started_at: a.completed_at,
    completed_at: a.completed_at,
    time_taken_seconds: a.time_taken_seconds,
    total_questions: a.total_questions,
    correct_answers: a.correct_answers,
    score_percentage: a.score_percentage,
    marks_earned: a.correct_answers,
    marks_total: a.total_questions,
    status: a.status as "completed",
    created_at: a.completed_at,
  }));
  return [...DEMO_ATTEMPTS.filter((a) => a.quiz_id === quizId), ...saved];
}

const DEMO_COURSES_KEY = "ollin_demo_courses";

export function getDemoCourses(): Course[] {
  const stored = localStorage.getItem(DEMO_COURSES_KEY);
  return stored ? JSON.parse(stored) : DEMO_COURSES;
}

const DEMO_PROGRAMS_KEY = "ollin_demo_programs";

export function getDemoPrograms(): Program[] {
  const stored = localStorage.getItem(DEMO_PROGRAMS_KEY);
  return stored ? JSON.parse(stored) : DEMO_PROGRAMS;
}

export function addDemoProgram(program: Program): void {
  const programs = getDemoPrograms();
  programs.push(program);
  localStorage.setItem(DEMO_PROGRAMS_KEY, JSON.stringify(programs));
}

export function addDemoCourse(course: Course): void {
  const courses = getDemoCourses();
  courses.push(course);
  localStorage.setItem(DEMO_COURSES_KEY, JSON.stringify(courses));
}

export function addDemoQuiz(quiz: Quiz, questions?: Question[]): void {
  if (typeof window === "undefined") return; // server can't use localStorage
  const quizzes = getDemoQuizzes();
  quizzes.unshift(quiz);
  localStorage.setItem(DEMO_QUIZZES_KEY, JSON.stringify(quizzes));
  if (questions && questions.length > 0) {
    const allQuestions = getDemoAllQuestions();
    allQuestions.push(...questions);
    localStorage.setItem(DEMO_QUESTIONS_KEY, JSON.stringify(allQuestions));
  }
}

function getDemoAllQuestions(): Question[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(DEMO_QUESTIONS_KEY);
  return stored ? JSON.parse(stored) : [];
}

// ─── Demo Quiz Attempts (results) ─────

const DEMO_ATTEMPTS_KEY = "ollin_demo_attempts";

export interface DemoAttempt {
  id: string;
  quiz_id: string;
  participant_name: string;
  score_percentage: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number | null;
  answers: Record<string, string>;
  status: string;
  completed_at: string;
}

export function saveDemoAttempt(attempt: DemoAttempt): void {
  const attempts = getDemoAllAttempts();
  attempts.push(attempt);
  localStorage.setItem(DEMO_ATTEMPTS_KEY, JSON.stringify(attempts));
}

export function getDemoAttemptsForQuiz(quizId: string): DemoAttempt[] {
  return getDemoAllAttempts().filter((a) => a.quiz_id === quizId);
}

function getDemoAllAttempts(): DemoAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(DEMO_ATTEMPTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// ─── Notifications (server-backed) ─────────
// All notification state lives on the server (Supabase table, or a per-user
// file when Supabase is unavailable). The browser stores nothing.

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "quiz" | "result" | "system";
  read: boolean;
  created_at: string;
}

// Fire-and-forget: create a notification for one or more users.
// Safe to call from guest flows — failures are silent by design.
export function addNotification(
  title: string,
  message: string,
  type: Notification["type"],
  userId?: string
): void {
  fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, message, type, ...(userId ? { user_id: userId } : {}) }),
  })
    .then((res) => {
      if (res.ok) window.dispatchEvent(new Event("notifications-updated"));
    })
    .catch(() => { /* delivery is best-effort */ });
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const res = await fetch("/api/notifications");
    if (!res.ok) return [];
    const data = await res.json();
    return data.notifications || [];
  } catch {
    return [];
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(() => { /* ignore */ });
  window.dispatchEvent(new Event("notifications-updated"));
}

export async function deleteNotification(id: string): Promise<void> {
  await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => { /* ignore */ });
  window.dispatchEvent(new Event("notifications-updated"));
}

export async function clearAllNotifications(): Promise<void> {
  await fetch("/api/notifications?all=true", { method: "DELETE" }).catch(() => { /* ignore */ });
  window.dispatchEvent(new Event("notifications-updated"));
}

export async function getUnreadCount(): Promise<number> {
  const notifs = await getNotifications();
  return notifs.filter((n) => !n.read).length;
}

// ─── Admin-Saved Quizzes (published to courses) ─────

const DEMO_SAVED_QUIZZES_KEY = "ollin_demo_saved_quizzes";

export interface SavedQuiz {
  quiz_id: string;
  course_id: string;
  saved_at: string;
}

export function getSavedQuizzes(): SavedQuiz[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(DEMO_SAVED_QUIZZES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function writeSavedQuizzesLocal(saved: SavedQuiz[]) {
  localStorage.setItem(DEMO_SAVED_QUIZZES_KEY, JSON.stringify(saved));
}

/** Sync the local saved-quiz cache from the server file (single source of truth). */
export async function syncSavedQuizzesFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/saved-quizzes");
    if (!res.ok) return;
    const data = await res.json();
    const serverLinks: SavedQuiz[] = (data.saved || []).map((s: any) => ({
      quiz_id: s.quiz_id,
      course_id: s.course_id,
      saved_at: s.saved_at || new Date().toISOString(),
    }));
    // Merge: server links win, keep any local-only links that haven't been synced yet
    const localLinks = getSavedQuizzes();
    const merged = [...serverLinks];
    for (const l of localLinks) {
      if (!merged.some((m) => m.quiz_id === l.quiz_id && m.course_id === l.course_id)) {
        merged.push(l);
      }
    }
    writeSavedQuizzesLocal(merged);
  } catch { /* ignore */ }
}

/**
 * Pull quizzes / courses / saved links from the server files into the local
 * cache so student pages show data created in other browsers (and by admin).
 */
export async function syncDemoDataFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const headers: Record<string, string> = isDemoMode() ? { "x-demo-mode": "true" } : {};

  // Quizzes (server file + defaults)
  try {
    const res = await fetch("/api/quizzes", { headers });
    if (res.ok) {
      const data = await res.json();
      const serverQuizzes: Quiz[] = data.quizzes || [];
      const local = getDemoQuizzes();
      const merged = [...serverQuizzes];
      for (const q of local) {
        if (!merged.some((m) => m.id === q.id)) merged.push(q);
      }
      localStorage.setItem(DEMO_QUIZZES_KEY, JSON.stringify(merged));
    }
  } catch { /* ignore */ }

  // Courses
  try {
    const res = await fetch("/api/courses", { headers });
    if (res.ok) {
      const data = await res.json();
      const serverCourses: Course[] = data.courses || [];
      const local = getDemoCourses();
      const merged = [...serverCourses];
      for (const c of local) {
        if (!merged.some((m) => m.id === c.id)) merged.push(c);
      }
      localStorage.setItem(DEMO_COURSES_KEY, JSON.stringify(merged));
    }
  } catch { /* ignore */ }

  // Saved quiz ↔ course links
  await syncSavedQuizzesFromServer();
}

export async function saveQuizToCourse(quizId: string, courseId: string): Promise<void> {
  const saved = getSavedQuizzes();
  // Don't duplicate
  if (saved.some((s) => s.quiz_id === quizId && s.course_id === courseId)) return;
  saved.push({ quiz_id: quizId, course_id: courseId, saved_at: new Date().toISOString() });
  writeSavedQuizzesLocal(saved);
  // Persist to server file so other browsers / students see it
  try {
    await fetch("/api/saved-quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId, course_id: courseId }),
    });
  } catch { /* ignore */ }
}

export async function removeSavedQuiz(quizId: string, courseId: string): Promise<void> {
  const saved = getSavedQuizzes().filter(
    (s) => !(s.quiz_id === quizId && s.course_id === courseId)
  );
  writeSavedQuizzesLocal(saved);
  try {
    await fetch(`/api/saved-quizzes?quiz_id=${encodeURIComponent(quizId)}&course_id=${encodeURIComponent(courseId)}`, {
      method: "DELETE",
    });
  } catch { /* ignore */ }
}

export function getSavedQuizzesForStudent(): Quiz[] {
  // Get quizzes saved by admin, filtered by the student's courses and year
  const saved = getSavedQuizzes();
  const allQuizzes = getDemoQuizzes();
  let allCourses = getDemoCourses();

  const user = getDemoUser();
  if (!user) return [];

  // Filter courses by student's current year
  const studentYear = user.current_year;
  if (studentYear) {
    allCourses = allCourses.filter((c) => !c.year || c.year === studentYear);
  }

  const studentCourseIds = allCourses.map((c) => c.id);

  return saved
    .filter((s) => studentCourseIds.includes(s.course_id))
    .map((s) => allQuizzes.find((q) => q.id === s.quiz_id))
    .filter((q): q is Quiz => q !== undefined);
}

export function isQuizSavedToCourse(quizId: string, courseId: string): boolean {
  return getSavedQuizzes().some(
    (s) => s.quiz_id === quizId && s.course_id === courseId
  );
}

