"use client";

import { isDemoMode, getDemoUser, getDemoUsers } from "./demo";

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

// Demo admin data
const DEMO_ADMIN: AdminUser = {
  id: "admin-001",
  email: "jkaidoo1@mail.com",
  full_name: "Admin User",
  role: "admin",
};

export function isAdmin(): boolean {
  if (typeof window === "undefined") return false;
  if (!isDemoMode()) return false;
  const user = getDemoUser();
  return user?.email === "jkaidoo1@mail.com";
}

export function getAdminUser(): AdminUser | null {
  if (!isAdmin()) return null;
  return DEMO_ADMIN;
}

export function enableAdminMode(): AdminUser {
  // Set the demo user as admin
  localStorage.setItem("ollin_demo_user", JSON.stringify(DEMO_ADMIN));
  return DEMO_ADMIN;
}

export function getAdminStats(): AdminStats {
  const users = getAllUsers();
  const quizzes = getAllQuizzes();
  // Count attempts across all quizzes
  let totalAttempts = 0;
  for (const quiz of quizzes) {
    try {
      const stored = localStorage.getItem("ollin_demo_attempts");
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
  return getDemoUsers();
}

export function getAllQuizzes() {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("ollin_demo_quizzes");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
