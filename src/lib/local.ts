"use client";

import { Quiz, Question, QuizAttempt, Course, Program } from "./types";

// One-time migration: browsers that used the pre-rename `ollin_demo_*` keys
// keep their session and data under the renamed `ollin_local_*` keys.
if (typeof window !== "undefined") {
  for (const name of ["user", "quizzes", "questions", "users", "programs", "courses", "attempts", "saved_quizzes", "notifications"]) {
    const from = `ollin_demo_${name}`;
    const to = `ollin_local_${name}`;
    try {
      if (localStorage.getItem(from) !== null && localStorage.getItem(to) === null) {
        localStorage.setItem(to, localStorage.getItem(from)!);
        localStorage.removeItem(from);
      }
    } catch { /* private mode etc. */ }
  }
}

const LOCAL_USER_KEY = "ollin_local_user";
const LOCAL_QUIZZES_KEY = "ollin_local_quizzes";
const LOCAL_QUESTIONS_KEY = "ollin_local_questions";

export interface LocalUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  password: string;
  current_year?: number;
}

const LOCAL_USERS_DEFAULT: LocalUser[] = [
  {
    id: "admin-001",
    email: "jkaidoo1@mail.com",
    full_name: "Admin User",
    role: "admin",
    password: "OllinAdmin1598",
  },
];

const LOCAL_USERS_KEY = "ollin_local_users";

export function getLocalUsers(): LocalUser[] {
  if (typeof window === "undefined") return LOCAL_USERS_DEFAULT;
  const stored = localStorage.getItem(LOCAL_USERS_KEY);
  if (stored) {
    try {
      const users: LocalUser[] = JSON.parse(stored);
      // Always sync built-in accounts with current defaults (passwords may change between deploys)
      let changed = false;
      for (const defaultUser of LOCAL_USERS_DEFAULT) {
        const existing = users.find((u) => u.id === defaultUser.id);
        if (existing && existing.password !== defaultUser.password) {
          existing.password = defaultUser.password;
          changed = true;
        }
      }
      if (changed) localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
      return users;
    } catch { /* ignore */ }
  }
  // Initialize with defaults
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(LOCAL_USERS_DEFAULT));
  return LOCAL_USERS_DEFAULT;
}

export function addLocalUser(user: LocalUser): void {
  const users = getLocalUsers();
  users.push(user);
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

export function removeLocalUser(userId: string): void {
  const users = getLocalUsers().filter((u) => u.id !== userId);
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

// All-users list includes admin + students (for admin panel display)
export function getAllLocalUsers() {
  return getLocalUsers();
}

const LOCAL_PROGRAMS: Program[] = [];

const LOCAL_COURSES: Course[] = [];

const LOCAL_QUIZZES: Quiz[] = [];

const LOCAL_QUESTIONS: Question[] = [];

const LOCAL_ATTEMPTS: QuizAttempt[] = [];

// ─── Local Mode API ─────────────────

export function isLocalMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LOCAL_USER_KEY) !== null;
}

export function getLocalUser(): LocalUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(LOCAL_USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function enableLocalMode(user?: LocalUser): LocalUser {
  const u = user || LOCAL_USERS_DEFAULT[1]; // default to student
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u));
  // Only initialize quizzes if none exist yet — don't overwrite student-created quizzes
  if (!localStorage.getItem(LOCAL_QUIZZES_KEY)) {
    localStorage.setItem(LOCAL_QUIZZES_KEY, JSON.stringify(LOCAL_QUIZZES));
  }
  // Ensure the logged-in user exists in the client users list (so the profile
  // year selector and admin edits can find them, even for admin-created accounts).
  const users = getLocalUsers();
  const existing = users.find((x) => x.id === u.id);
  if (existing) {
    existing.email = u.email;
    existing.full_name = u.full_name;
    existing.role = u.role;
    if (u.current_year !== undefined) existing.current_year = u.current_year;
  } else {
    users.push({ ...u, password: u.password || "" });
  }
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  return u;
}

/**
 * Authenticate a local user by email + password.
 * Returns the user if credentials match, null otherwise.
 */
export function authenticateLocalUser(email: string, password: string): LocalUser | null {
  const users = getLocalUsers();
  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  return user || null;
}

export function disableLocalMode(): void {
  localStorage.removeItem(LOCAL_USER_KEY);
  localStorage.removeItem(LOCAL_QUIZZES_KEY);
}

export function getLocalQuizzes(): Quiz[] {
  const stored = localStorage.getItem(LOCAL_QUIZZES_KEY);
  return stored ? JSON.parse(stored) : LOCAL_QUIZZES;
}

export function getLocalQuizById(id: string): Quiz | undefined {
  return getLocalQuizzes().find((q) => q.id === id);
}

export function getLocalQuizByCode(code: string): Quiz | undefined {
  return getLocalQuizzes().find((q) => q.share_code === code);
}

export function getLocalQuestions(quizId: string): Question[] {
  if (quizId === "local-quiz-001") return LOCAL_QUESTIONS;
  const stored = getLocalAllQuestions();
  return stored.filter((q) => q.quiz_id === quizId);
}

export function getLocalAttempts(quizId: string): QuizAttempt[] {
  // Combine hardcoded local attempts + saved attempts from localStorage
  const saved = getLocalAttemptsForQuiz(quizId).map((a) => ({
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
  return [...LOCAL_ATTEMPTS.filter((a) => a.quiz_id === quizId), ...saved];
}

const LOCAL_COURSES_KEY = "ollin_local_courses";

export function getLocalCourses(): Course[] {
  const stored = localStorage.getItem(LOCAL_COURSES_KEY);
  return stored ? JSON.parse(stored) : LOCAL_COURSES;
}

const LOCAL_PROGRAMS_KEY = "ollin_local_programs";

export function getLocalPrograms(): Program[] {
  const stored = localStorage.getItem(LOCAL_PROGRAMS_KEY);
  return stored ? JSON.parse(stored) : LOCAL_PROGRAMS;
}

export function addLocalProgram(program: Program): void {
  const programs = getLocalPrograms();
  programs.push(program);
  localStorage.setItem(LOCAL_PROGRAMS_KEY, JSON.stringify(programs));
}

export function addLocalCourse(course: Course): void {
  const courses = getLocalCourses();
  courses.push(course);
  localStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(courses));
}

export function addLocalQuiz(quiz: Quiz, questions?: Question[]): void {
  if (typeof window === "undefined") return; // server can't use localStorage
  const quizzes = getLocalQuizzes();
  quizzes.unshift(quiz);
  localStorage.setItem(LOCAL_QUIZZES_KEY, JSON.stringify(quizzes));
  if (questions && questions.length > 0) {
    const allQuestions = getLocalAllQuestions();
    allQuestions.push(...questions);
    localStorage.setItem(LOCAL_QUESTIONS_KEY, JSON.stringify(allQuestions));
  }
}

function getLocalAllQuestions(): Question[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(LOCAL_QUESTIONS_KEY);
  return stored ? JSON.parse(stored) : [];
}

// ─── Local Quiz Attempts (results) ─────

const LOCAL_ATTEMPTS_KEY = "ollin_local_attempts";

export interface LocalAttempt {
  id: string;
  quiz_id: string;
  participant_email: string | null;
  participant_name: string;
  score_percentage: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number | null;
  answers: Record<string, string>;
  status: string;
  completed_at: string;
}

export function saveLocalAttempt(attempt: LocalAttempt): void {
  const attempts = getLocalAllAttempts();
  attempts.push(attempt);
  localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(attempts));
}

export function getLocalAttemptsForQuiz(quizId: string): LocalAttempt[] {
  return getLocalAllAttempts().filter((a) => a.quiz_id === quizId);
}

function getLocalAllAttempts(): LocalAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(LOCAL_ATTEMPTS_KEY);
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

const LOCAL_SAVED_QUIZZES_KEY = "ollin_local_saved_quizzes";

export interface SavedQuiz {
  quiz_id: string;
  course_id: string;
  saved_at: string;
}

export function getSavedQuizzes(): SavedQuiz[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(LOCAL_SAVED_QUIZZES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function writeSavedQuizzesLocal(saved: SavedQuiz[]) {
  localStorage.setItem(LOCAL_SAVED_QUIZZES_KEY, JSON.stringify(saved));
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
export async function syncLocalDataFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const headers: Record<string, string> = isLocalMode() ? { "x-local-mode": "true" } : {};

  // Quizzes (server file + defaults)
  try {
    const res = await fetch("/api/quizzes", { headers });
    if (res.ok) {
      const data = await res.json();
      const serverQuizzes: Quiz[] = data.quizzes || [];
      const local = getLocalQuizzes();
      const merged = [...serverQuizzes];
      for (const q of local) {
        if (!merged.some((m) => m.id === q.id)) merged.push(q);
      }
      localStorage.setItem(LOCAL_QUIZZES_KEY, JSON.stringify(merged));
    }
  } catch { /* ignore */ }

  // Courses
  try {
    const res = await fetch("/api/courses", { headers });
    if (res.ok) {
      const data = await res.json();
      const serverCourses: Course[] = data.courses || [];
      const local = getLocalCourses();
      const merged = [...serverCourses];
      for (const c of local) {
        if (!merged.some((m) => m.id === c.id)) merged.push(c);
      }
      localStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(merged));
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
  const allQuizzes = getLocalQuizzes();
  let allCourses = getLocalCourses();

  const user = getLocalUser();
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

