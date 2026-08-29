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
}

const DEMO_USERS_DEFAULT: DemoUser[] = [
  {
    id: "admin-001",
    email: "jkaidoo1@mail.com",
    full_name: "Admin User",
    role: "admin",
    password: "OllinAdmin1598",
  },
  {
    id: "demo-user-001",
    email: "demo@ollin.app",
    full_name: "Alex Student",
    role: "student",
    password: "password",
  },
];

const DEMO_USERS_KEY = "ollin_demo_users";

export function getDemoUsers(): DemoUser[] {
  if (typeof window === "undefined") return DEMO_USERS_DEFAULT;
  const stored = localStorage.getItem(DEMO_USERS_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch { /* ignore */ }
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

const DEMO_PROGRAMS: Program[] = [
  {
    id: "demo-program-001",
    code: "BSc CS",
    name: "BSc Computer Science",
    department: "Computer Science",
    description: "Four-year undergraduate program in computer science.",
    created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 90).toISOString(),
  },
  {
    id: "demo-program-002",
    code: "BSc BIO",
    name: "BSc Biology",
    department: "Biology",
    description: "Four-year undergraduate program in biology.",
    created_at: new Date(Date.now() - 86400000 * 85).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 85).toISOString(),
  },
  {
    id: "demo-program-003",
    code: "BA HIS",
    name: "BA History",
    department: "History",
    description: "Three-year undergraduate program in history.",
    created_at: new Date(Date.now() - 86400000 * 80).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 80).toISOString(),
  },
  {
    id: "demo-program-004",
    code: "BSc MATH",
    name: "BSc Mathematics",
    department: "Mathematics",
    description: "Four-year undergraduate program in mathematics.",
    created_at: new Date(Date.now() - 86400000 * 75).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 75).toISOString(),
  },
];

const DEMO_COURSES: Course[] = [
  {
    id: "demo-course-001",
    code: "CSC 101",
    name: "Introduction to Computer Science",
    description: "Fundamentals of computing, algorithms, and programming concepts.",
    department: "Computer Science",
    program_id: "demo-program-001",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
  {
    id: "demo-course-002",
    code: "BIO 201",
    name: "Cell Biology",
    description: "Cell structure, organelles, division, and molecular processes.",
    department: "Biology",
    program_id: "demo-program-002",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 55).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 55).toISOString(),
  },
  {
    id: "demo-course-003",
    code: "HIS 301",
    name: "World History: Ancient Civilizations",
    description: "Mesopotamia, Egypt, Greece, and Rome.",
    department: "History",
    program_id: "demo-program-003",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 50).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 50).toISOString(),
  },
  {
    id: "demo-course-004",
    code: "MTH 102",
    name: "Calculus I",
    description: "Limits, derivatives, and integrals.",
    department: "Mathematics",
    program_id: "demo-program-004",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
  {
    id: "demo-course-005",
    code: "GST 101",
    name: "Communication Skills",
    description: "English language, writing, and presentation skills for all students.",
    department: "General Studies",
    program_id: null,
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
];

const DEMO_QUIZZES: Quiz[] = [
  {
    id: "demo-quiz-001",
    host_id: "demo-user-001",
    title: "Introduction to Biology",
    description: "Covers cell structure, organelles, and basic biological processes.",
    share_code: "BIO-12345",
    time_limit_minutes: 15,
    max_attempts: 1,
    show_answers_after: "after_completion",
    shuffle_questions: true,
    shuffle_options: true,
    passing_score: 60,
    starts_at: null,
    ends_at: null,
    status: "published",
    course_id: "demo-course-002",
    material_id: null,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "demo-quiz-002",
    host_id: "demo-user-001",
    title: "World History: Ancient Civilizations",
    description: "Mesopotamia, Egypt, Greece, and Rome.",
    share_code: "HIS-67890",
    time_limit_minutes: 20,
    max_attempts: 2,
    show_answers_after: "after_completion",
    shuffle_questions: false,
    shuffle_options: true,
    passing_score: 50,
    starts_at: null,
    ends_at: null,
    status: "completed",
    course_id: "demo-course-003",
    material_id: null,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "demo-quiz-003",
    host_id: "demo-user-001",
    title: "Calculus Fundamentals",
    description: "Limits, derivatives, and integrals.",
    share_code: "CAL-11223",
    time_limit_minutes: null,
    max_attempts: 1,
    show_answers_after: "never",
    shuffle_questions: true,
    shuffle_options: false,
    passing_score: 70,
    starts_at: null,
    ends_at: null,
    status: "draft",
    course_id: "demo-course-004",
    material_id: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

const DEMO_QUESTIONS: Question[] = [
  {
    id: "demo-q-001",
    quiz_id: "demo-quiz-001",
    question_text: "What is the powerhouse of the cell?",
    question_type: "multiple_choice",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Endoplasmic Reticulum"],
    correct_answer: "1",
    explanation: "Mitochondria are known as the powerhouse of the cell because they generate most of the cell's supply of ATP through cellular respiration.",
    topic: "Cell Biology",
    difficulty: "easy",
    marks: 1,
    order_index: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-002",
    quiz_id: "demo-quiz-001",
    question_text: "Which organelle is responsible for protein synthesis?",
    question_type: "multiple_choice",
    options: ["Golgi Apparatus", "Lysosome", "Ribosome", "Vacuole"],
    correct_answer: "2",
    explanation: "Ribosomes are the sites of protein synthesis. They can be found floating freely in the cytoplasm or attached to the rough ER.",
    topic: "Cell Biology",
    difficulty: "easy",
    marks: 1,
    order_index: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-003",
    quiz_id: "demo-quiz-001",
    question_text: "DNA replication occurs during which phase of the cell cycle?",
    question_type: "multiple_choice",
    options: ["G1 Phase", "S Phase", "G2 Phase", "M Phase"],
    correct_answer: "1",
    explanation: "DNA replication occurs during the S (Synthesis) phase of interphase, before the cell divides.",
    topic: "Cell Division",
    difficulty: "medium",
    marks: 1,
    order_index: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-004",
    quiz_id: "demo-quiz-001",
    question_text: "Plant cells have cell walls while animal cells do not.",
    question_type: "true_false",
    options: ["True", "False"],
    correct_answer: "true",
    explanation: "This is correct. Plant cells have a rigid cell wall made of cellulose that provides structural support, while animal cells only have a cell membrane.",
    topic: "Cell Structure",
    difficulty: "easy",
    marks: 1,
    order_index: 3,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-005",
    quiz_id: "demo-quiz-001",
    question_text: "Which of the following is NOT a function of the cell membrane?",
    question_type: "multiple_choice",
    options: [
      "Selective permeability",
      "Cell signaling",
      "ATP production",
      "Protection",
    ],
    correct_answer: "2",
    explanation: "ATP production is a function of mitochondria, not the cell membrane. The cell membrane controls what enters and exits the cell, facilitates signaling, and provides protection.",
    topic: "Cell Structure",
    difficulty: "medium",
    marks: 1,
    order_index: 4,
    created_at: new Date().toISOString(),
  },
];

const DEMO_ATTEMPTS: QuizAttempt[] = [
  {
    id: "demo-att-001",
    quiz_id: "demo-quiz-002",
    participant_id: null,
    participant_name: "Sarah Johnson",
    started_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    completed_at: new Date(Date.now() - 86400000 * 8 + 720000).toISOString(),
    time_taken_seconds: 720,
    total_questions: 10,
    correct_answers: 8,
    score_percentage: 80,
    marks_earned: 8,
    marks_total: 10,
    status: "completed",
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
  {
    id: "demo-att-002",
    quiz_id: "demo-quiz-002",
    participant_id: null,
    participant_name: "Marcus Lee",
    started_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    completed_at: new Date(Date.now() - 86400000 * 7 + 900000).toISOString(),
    time_taken_seconds: 900,
    total_questions: 10,
    correct_answers: 6,
    score_percentage: 60,
    marks_earned: 6,
    marks_total: 10,
    status: "completed",
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: "demo-att-003",
    quiz_id: "demo-quiz-002",
    participant_id: null,
    participant_name: "Emily Chen",
    started_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    completed_at: new Date(Date.now() - 86400000 * 6 + 600000).toISOString(),
    time_taken_seconds: 600,
    total_questions: 10,
    correct_answers: 9,
    score_percentage: 90,
    marks_earned: 9,
    marks_total: 10,
    status: "completed",
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
  },
  {
    id: "demo-att-004",
    quiz_id: "demo-quiz-001",
    participant_id: null,
    participant_name: "James Wilson",
    started_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    completed_at: new Date(Date.now() - 86400000 + 480000).toISOString(),
    time_taken_seconds: 480,
    total_questions: 5,
    correct_answers: 4,
    score_percentage: 80,
    marks_earned: 4,
    marks_total: 5,
    status: "completed",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

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
  // Initialize users list if none exist
  if (!localStorage.getItem(DEMO_USERS_KEY)) {
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(DEMO_USERS_DEFAULT));
  }
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

// ─── Demo Notifications ─────────────────

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "quiz" | "result" | "system";
  read: boolean;
  created_at: string;
}

const DEMO_NOTIFICATIONS: Notification[] = [];

const DEMO_NOTIFS_KEY = "ollin_demo_notifications";

export function getDemoNotifications(): Notification[] {
  if (typeof window === "undefined") return DEMO_NOTIFICATIONS;
  const stored = localStorage.getItem(DEMO_NOTIFS_KEY);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(DEMO_NOTIFS_KEY, JSON.stringify(DEMO_NOTIFICATIONS));
  return DEMO_NOTIFICATIONS;
}

export function markAllNotificationsRead(): void {
  const current = getDemoNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  localStorage.setItem(DEMO_NOTIFS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event("notifications-updated"));
  // Also dispatch a storage event so other listeners pick it up
  window.dispatchEvent(new StorageEvent("storage", { key: DEMO_NOTIFS_KEY }));
}

export function deleteNotification(id: string): void {
  const current = getDemoNotifications();
  const updated = current.filter((n) => n.id !== id);
  localStorage.setItem(DEMO_NOTIFS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event("notifications-updated"));
}

export function clearAllNotifications(): void {
  localStorage.setItem(DEMO_NOTIFS_KEY, JSON.stringify([]));
  window.dispatchEvent(new Event("notifications-updated"));
}

export function getUnreadCount(): number {
  return getDemoNotifications().filter((n) => !n.read).length;
}

export function addNotification(title: string, message: string, type: Notification["type"]): void {
  const notifs = getDemoNotifications();
  const newNotif: Notification = {
    id: `notif-${Date.now()}`,
    title,
    message,
    type,
    read: false,
    created_at: new Date().toISOString(),
  };
  notifs.unshift(newNotif);
  localStorage.setItem(DEMO_NOTIFS_KEY, JSON.stringify(notifs));
  window.dispatchEvent(new Event("notifications-updated"));
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

export function saveQuizToCourse(quizId: string, courseId: string): void {
  const saved = getSavedQuizzes();
  // Don't duplicate
  if (saved.some((s) => s.quiz_id === quizId && s.course_id === courseId)) return;
  saved.push({ quiz_id: quizId, course_id: courseId, saved_at: new Date().toISOString() });
  localStorage.setItem(DEMO_SAVED_QUIZZES_KEY, JSON.stringify(saved));
}

export function removeSavedQuiz(quizId: string, courseId: string): void {
  const saved = getSavedQuizzes().filter(
    (s) => !(s.quiz_id === quizId && s.course_id === courseId)
  );
  localStorage.setItem(DEMO_SAVED_QUIZZES_KEY, JSON.stringify(saved));
}

export function getSavedQuizzesForStudent(): Quiz[] {
  // Get quizzes saved by admin, filtered by the student's courses
  const saved = getSavedQuizzes();
  const allQuizzes = getDemoQuizzes();
  const allCourses = getDemoCourses();

  // Get student's program
  const user = getDemoUser();
  if (!user) return [];

  // Find student's courses (program-specific + general courses)
  // In demo mode, user has no program, so show all saved quizzes
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

