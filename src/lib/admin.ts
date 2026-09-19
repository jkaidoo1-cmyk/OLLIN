"use client";

import { isLocalMode, getLocalUser, getLocalUsers } from "./local";
import { ADMIN_EMAIL } from "./local-constants";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin";
}

export interface AdminStats {
  totalUsers: number;
  totalQuizzes: number;
  totalAttempts: number;
  publishedQuizzes: number;
}

/**
 * Is the current session an admin?
 * Local sessions: any account whose role is "admin" (not just the seed email).
 */
export function isAdmin(): boolean {
  if (typeof window === "undefined") return false;
  if (!isLocalMode()) return false;
  const user = getLocalUser();
  if (!user) return false;
  // Role-based, with a fallback for sessions created before roles existed.
  return user.role === "admin" || user.email === ADMIN_EMAIL;
}

export function getAdminUser(): AdminUser | null {
  if (!isAdmin()) return null;
  const user = getLocalUser();
  return {
    id: user?.id || "admin-001",
    email: user?.email || ADMIN_EMAIL,
    full_name: user?.full_name || "Admin User",
    role: "admin",
  };
}

export function enableAdminMode(): AdminUser {
  // Legacy helper — admin accounts should be created through the Users page now.
  const admin = {
    id: "admin-001",
    email: ADMIN_EMAIL,
    full_name: "Admin User",
    role: "admin" as const,
  };
  localStorage.setItem("ollin_local_user", JSON.stringify(admin));
  return admin;
}

export function getAdminStats(): AdminStats {
  const users = getAllUsers();
  const quizzes = getAllQuizzes();
  // Count attempts across all quizzes
  let totalAttempts = 0;
  for (const quiz of quizzes) {
    try {
      const stored = localStorage.getItem("ollin_local_attempts");
      if (stored) {
        const allAttempts = JSON.parse(stored);
        totalAttempts += allAttempts.filter((a: any) => a.quiz_id === quiz.id).length;
      }
    } catch { /* ignore */ }
  }
  return {
    totalUsers: users.length,
    totalQuizzes: quizzes.length,
    totalAttempts,
    publishedQuizzes: quizzes.filter((q: any) => q.status === "published").length,
  };
}

export function getAllUsers() {
  if (typeof window === "undefined") return [];
  return getLocalUsers();
}

export function getAllQuizzes() {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("ollin_local_quizzes");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
