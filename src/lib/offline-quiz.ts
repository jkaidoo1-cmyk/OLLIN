"use client";

import { isAnswerCorrect } from "./grading";
import { invalidateResource } from "./prefetch";
import type { Question, Quiz } from "./types";

/**
 * Quizzes kept on the device, so they can be taken with no connection.
 *
 * A copy holds the paper AND its answer key. That is what makes offline
 * marking possible: the server cannot grade a submission it never receives, so
 * the browser compares each answer with the stored key using the same rules as
 * `/api/attempts/[id]/submit` (marks-weighted, `isAnswerCorrect`).
 *
 * Results marked this way are shown immediately and, for a recorded attempt
 * (not a practice run), queued here and filed with the server — which re-grades
 * authoritatively — the next time the app is online.
 *
 * Theory questions are the exception: prose has to reach the AI, so a paper
 * containing one is not submitted offline (the quiz page says so and offers
 * Save for later instead).
 */

const BUNDLE_PREFIX = "ollin_quiz_bundle:";
const PENDING_KEY = "ollin_pending_attempts";
/** A single stored paper is capped so one huge quiz cannot fill the origin. */
const MAX_BUNDLE_BYTES = 900_000;
const MAX_BUNDLES = 12;
const MAX_PENDING = 20;

export interface OfflineQuizBundle {
  quiz: Quiz;
  questions: Question[];
  savedAt: string;
}

export interface PendingAttempt {
  quizId: string;
  quizCode: string;
  participantName: string;
  participantEmail: string | null;
  startedAt: string;
  submittedAt: string;
  timeTakenSeconds: number | null;
  answers: Array<{ question_id: string; selected_answer: string }>;
  score: number;
}

export interface OfflineGrade {
  score: number;
  correct: number;
  total: number;
  detailed: Array<{ question: Question; selected: string | null; isCorrect: boolean }>;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function bundleKeys(): string[] {
  const s = storage();
  if (!s) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(BUNDLE_PREFIX)) keys.push(key);
    }
  } catch {
    /* storage blocked */
  }
  return keys;
}

function readBundle(key: string): OfflineQuizBundle | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineQuizBundle | null;
    if (!parsed?.quiz || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Keep a paper on this device. Returns false when it could not be stored
 * (storage blocked, full, or the payload is too large to be worth keeping).
 */
export function saveQuizBundle(bundle: OfflineQuizBundle): boolean {
  const s = storage();
  if (!s || !bundle?.quiz?.id || !Array.isArray(bundle.questions) || bundle.questions.length === 0) {
    return false;
  }
  const payload = JSON.stringify(bundle);
  if (payload.length > MAX_BUNDLE_BYTES) return false;

  // Drop the oldest copies when the device is holding too many.
  const existing = bundleKeys();
  if (existing.length >= MAX_BUNDLES) {
    const byAge = existing
      .map((key) => ({ key, at: Date.parse(readBundle(key)?.savedAt || "") || 0 }))
      .sort((a, b) => a.at - b.at);
    for (const entry of byAge.slice(0, existing.length - MAX_BUNDLES + 1)) {
      try {
        s.removeItem(entry.key);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    s.setItem(BUNDLE_PREFIX + bundle.quiz.id, payload);
    return true;
  } catch {
    // Quota: keep the newer copy by dropping every stored paper and retrying once.
    try {
      for (const key of bundleKeys()) s.removeItem(key);
      s.setItem(BUNDLE_PREFIX + bundle.quiz.id, payload);
      return true;
    } catch {
      return false;
    }
  }
}

function normaliseCode(code: string): string {
  return String(code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** The saved copy of a quiz, looked up by share code. */
export function getQuizBundleByCode(code: string): OfflineQuizBundle | null {
  const wanted = normaliseCode(code);
  if (!wanted) return null;
  for (const key of bundleKeys()) {
    const bundle = readBundle(key);
    if (bundle && normaliseCode(bundle.quiz.share_code) === wanted) return bundle;
  }
  return null;
}

/** The saved copy of a quiz, looked up by quiz id. */
export function getQuizBundleById(id: string): OfflineQuizBundle | null {
  if (!id) return null;
  return readBundle(BUNDLE_PREFIX + id);
}

/**
 * Ask the server for the paper WITH its answer key and store it. Signed-in
 * students only (the endpoint refuses anonymous callers), so this is a no-op
 * for guests and while offline.
 */
export async function fetchAndSaveQuizBundle(code: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const res = await fetch(`/api/quizzes/${encodeURIComponent(code)}?include=offline`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.quiz || data.quiz.status === "draft" || !Array.isArray(data.questions) || !data.questions.length) {
      return false;
    }
    return saveQuizBundle({
      quiz: data.quiz,
      questions: data.questions,
      savedAt: new Date().toISOString(),
    });
  } catch {
    return false;
  }
}

/**
 * Ask the service worker to keep this quiz's screen too, so opening the link
 * offline reaches a real page rather than the offline notice.
 */
export function warmQuizPage(code: string): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      const worker = registration.active || navigator.serviceWorker.controller;
      worker?.postMessage({ type: "warm-quiz-page", code });
    })
    .catch(() => { /* no worker (dev server, unsupported browser) */ });
}

/**
 * Mark a paper on this device. Mirrors the server: each question is worth its
 * own marks, the score is marks earned over marks available, and a question
 * left blank is wrong.
 */
export function gradeOffline(questions: Question[], answers: Record<string, string>): OfflineGrade {
  let marksEarned = 0;
  let marksTotal = 0;
  let correct = 0;

  const detailed = questions.map((question) => {
    const selected = answers[question.id] ?? "";
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    const isCorrect =
      selected.trim().length > 0 &&
      isAnswerCorrect(
        selected.trim().toLowerCase(),
        String(question.correct_answer ?? "").trim().toLowerCase(),
        options
      );
    const marks = Number(question.marks) || 1;
    marksTotal += marks;
    if (isCorrect) {
      marksEarned += marks;
      correct += 1;
    }
    return { question, selected: selected || null, isCorrect };
  });

  return {
    score: marksTotal > 0 ? Math.round((marksEarned / marksTotal) * 100) : 0,
    correct,
    total: questions.length,
    detailed,
  };
}

// ─── Attempts marked offline but not yet filed ───────────

function readPending(): PendingAttempt[] {
  const s = storage();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s.getItem(PENDING_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as PendingAttempt[]) : [];
  } catch {
    return [];
  }
}

function writePending(items: PendingAttempt[]): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PENDING_KEY, JSON.stringify(items.slice(-MAX_PENDING)));
  } catch {
    /* storage full — the result is still on screen */
  }
}

/** Keep an offline result so it can be filed once there is a connection. */
export function queuePendingAttempt(entry: PendingAttempt): void {
  if (!entry?.quizId) return;
  writePending([...readPending(), entry]);
}

export function pendingAttempts(): PendingAttempt[] {
  return readPending();
}

/**
 * Post every queued result to the server, which re-grades and records it.
 * Network failures keep the entry for the next attempt; a refusal (already
 * taken, quiz closed, time up) is final and the entry is dropped — retrying it
 * would only fail again.
 */
export async function flushPendingAttempts(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const queue = readPending();
  if (queue.length === 0) return 0;

  let filed = 0;
  const remaining: PendingAttempt[] = [];

  for (const item of queue) {
    try {
      const join = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: item.quizId,
          participant_name: item.participantName,
          status: "in_progress",
        }),
      });
      if (!join.ok) {
        if (join.status >= 400 && join.status < 500) continue; // refused for good
        remaining.push(item);
        continue;
      }
      const joined = (await join.json().catch(() => null)) as { attempt?: { id?: string } } | null;
      const attemptId = joined?.attempt?.id;
      if (!attemptId) {
        remaining.push(item);
        continue;
      }

      const res = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: item.quizId,
          participant_name: item.participantName,
          participant_email: item.participantEmail ?? null,
          time_taken_seconds: item.timeTakenSeconds,
          started_at: item.startedAt,
          submitted_at: item.submittedAt,
          answers: item.answers,
        }),
      });
      if (res.ok) {
        filed += 1;
        continue;
      }
      if (res.status >= 400 && res.status < 500) continue; // refused for good
      remaining.push(item);
    } catch {
      remaining.push(item); // still offline
    }
  }

  writePending(remaining);
  if (filed > 0) {
    try {
      invalidateResource("my-attempts");
    } catch {
      /* not fatal */
    }
  }
  return filed;
}

/** Forget every stored paper and queued result (login, logout, device change). */
export function clearOfflineQuizData(): void {
  const s = storage();
  if (!s) return;
  for (const key of bundleKeys()) {
    try {
      s.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    s.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
