/**
 * Server-safe fallbacks for file-backed storage.
 *
 * Beyond the (intentionally empty) local-content arrays, this module seeds
 * the built-in TEST QUIZ — a small deterministic quiz that exists on every
 * server, including read-only deployments (Vercel) where the .ollin-*.json
 * files can't persist. It gives anyone a working quiz to try the platform
 * with, from any device. File-stored quizzes always take priority in data.ts;
 * these defaults only fill the gaps.
 */

import { Quiz, Question, QuizAttempt, Course, Program } from "./types";

export const LOCAL_PROGRAMS: Program[] = [];
export const LOCAL_COURSES: Course[] = [];
export const LOCAL_ATTEMPTS: QuizAttempt[] = [];

// ─── Built-in test quiz (TST-101) ────────────────────────────

const TEST_QUIZ_ID = "quiz-test-tst101";

const TEST_QUIZ: Quiz = {
  id: TEST_QUIZ_ID,
  host_id: "system",
  title: "OLLIN Test Quiz",
  description: "General-purpose quiz for testing the platform end to end.",
  share_code: "TST-101",
  time_limit_minutes: 15,
  max_attempts: 1,
  show_answers_after: "after_completion",
  shuffle_questions: false,
  shuffle_options: false,
  passing_score: 50,
  starts_at: null,
  ends_at: null,
  status: "published",
  course_id: null,
  material_id: null,
  created_at: "2026-09-24T17:00:00.000Z",
  updated_at: "2026-09-24T17:00:00.000Z",
};

const TEST_QUESTIONS: Question[] = [
  {
    id: "q-tst101-1",
    quiz_id: TEST_QUIZ_ID,
    question_text: "What does PWA stand for?",
    question_type: "multiple_choice",
    options: ["Progressive Web App", "Private Web Address", "Public Web API"],
    correct_answer: "0",
    explanation: "A Progressive Web App installs to your home screen and works like a native app.",
    topic: null,
    difficulty: "easy",
    marks: 1,
    order_index: 0,
    created_at: TEST_QUIZ.created_at,
  },
  {
    id: "q-tst101-2",
    quiz_id: TEST_QUIZ_ID,
    question_text: "Which of these is a Web3 programming language used for smart contracts?",
    question_type: "multiple_choice",
    options: ["Solidity", "Swift", "Kotlin"],
    correct_answer: "0",
    explanation: "Solidity targets the Ethereum Virtual Machine.",
    topic: null,
    difficulty: "easy",
    marks: 1,
    order_index: 1,
    created_at: TEST_QUIZ.created_at,
  },
  {
    id: "q-tst101-3",
    quiz_id: TEST_QUIZ_ID,
    question_text: "HTTPS encrypts traffic between the browser and the server.",
    question_type: "true_false",
    options: null,
    correct_answer: "true",
    explanation: "TLS secures HTTP traffic in transit.",
    topic: null,
    difficulty: "easy",
    marks: 1,
    order_index: 2,
    created_at: TEST_QUIZ.created_at,
  },
  {
    id: "q-tst101-4",
    quiz_id: TEST_QUIZ_ID,
    question_text: "Which HTTP status code means 'Not Found'?",
    question_type: "multiple_choice",
    options: ["404", "500", "403"],
    correct_answer: "0",
    explanation: "404 Not Found; 403 is Forbidden; 500 is a server error.",
    topic: null,
    difficulty: "easy",
    marks: 1,
    order_index: 3,
    created_at: TEST_QUIZ.created_at,
  },
  {
    id: "q-tst101-5",
    quiz_id: TEST_QUIZ_ID,
    question_text: "A quiz attempt with no answers submitted scores 0%.",
    question_type: "true_false",
    options: null,
    correct_answer: "true",
    explanation: "No correct answers means a score of zero.",
    topic: null,
    difficulty: "easy",
    marks: 1,
    order_index: 4,
    created_at: TEST_QUIZ.created_at,
  },
];

export const LOCAL_QUIZZES: Quiz[] = [TEST_QUIZ];
export const LOCAL_QUESTIONS: Question[] = TEST_QUESTIONS;

const norm = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export function serverGetLocalQuizByCode(code: string): Quiz | undefined {
  return LOCAL_QUIZZES.find((q) => norm(q.share_code || "") === norm(code));
}

export function serverGetLocalQuizById(id: string): Quiz | undefined {
  return LOCAL_QUIZZES.find((q) => q.id === id);
}

export function serverGetLocalQuizzes(): Quiz[] {
  return LOCAL_QUIZZES;
}

export function serverGetLocalQuestions(quizId: string): Question[] {
  return LOCAL_QUESTIONS.filter((q) => q.quiz_id === quizId);
}

export function serverGetLocalAttempts(_quizId: string): QuizAttempt[] {
  return [];
}

export function serverGetLocalCourses(): Course[] {
  return LOCAL_COURSES;
}

export function serverGetLocalCourseById(_id: string): Course | undefined {
  return undefined;
}

export function serverGetLocalPrograms(): Program[] {
  return LOCAL_PROGRAMS;
}

export function serverGetLocalProgramById(_id: string): Program | undefined {
  return undefined;
}
