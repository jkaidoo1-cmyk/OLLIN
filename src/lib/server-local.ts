/**
 * Server-safe fallbacks for file-backed storage.
 *
 * Historically this file held a full set of hardcoded local content (fake
 * programs, courses, quizzes, questions, and attempts). All seeded content has
 * been removed: the platform now runs exclusively on real data — either
 * Supabase (when configured and reachable) or the server-side .ollin-*.json
 * files. These empty arrays remain only so existing imports keep resolving;
 * new code should read from data.ts instead.
 */

import { Quiz, Question, QuizAttempt, Course, Program } from "./types";

export const LOCAL_PROGRAMS: Program[] = [];
export const LOCAL_COURSES: Course[] = [];
export const LOCAL_QUIZZES: Quiz[] = [];
export const LOCAL_QUESTIONS: Question[] = [];
export const LOCAL_ATTEMPTS: QuizAttempt[] = [];

export function serverGetLocalQuizByCode(_code: string): Quiz | undefined {
  return undefined;
}

export function serverGetLocalQuizById(_id: string): Quiz | undefined {
  return undefined;
}

export function serverGetLocalQuizzes(): Quiz[] {
  return LOCAL_QUIZZES;
}

export function serverGetLocalQuestions(_quizId: string): Question[] {
  return [];
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
