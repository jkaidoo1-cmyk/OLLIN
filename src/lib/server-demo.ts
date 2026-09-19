/**
 * Server-safe fallbacks for file-backed storage.
 *
 * Historically this file held a full set of hardcoded demo content (fake
 * programs, courses, quizzes, questions, and attempts). All seeded content has
 * been removed: the platform now runs exclusively on real data — either
 * Supabase (when configured and reachable) or the server-side .ollin-*.json
 * files. These empty arrays remain only so existing imports keep resolving;
 * new code should read from data.ts instead.
 */

import { Quiz, Question, QuizAttempt, Course, Program } from "./types";

export const DEMO_PROGRAMS: Program[] = [];
export const DEMO_COURSES: Course[] = [];
export const DEMO_QUIZZES: Quiz[] = [];
export const DEMO_QUESTIONS: Question[] = [];
export const DEMO_ATTEMPTS: QuizAttempt[] = [];

export function serverGetDemoQuizByCode(_code: string): Quiz | undefined {
  return undefined;
}

export function serverGetDemoQuizById(_id: string): Quiz | undefined {
  return undefined;
}

export function serverGetDemoQuizzes(): Quiz[] {
  return DEMO_QUIZZES;
}

export function serverGetDemoQuestions(_quizId: string): Question[] {
  return [];
}

export function serverGetDemoAttempts(_quizId: string): QuizAttempt[] {
  return [];
}

export function serverGetDemoCourses(): Course[] {
  return DEMO_COURSES;
}

export function serverGetDemoCourseById(_id: string): Course | undefined {
  return undefined;
}

export function serverGetDemoPrograms(): Program[] {
  return DEMO_PROGRAMS;
}

export function serverGetDemoProgramById(_id: string): Program | undefined {
  return undefined;
}
