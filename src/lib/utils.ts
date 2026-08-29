import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Generate a unique quiz share code like "CMG-7K2P9"
 */
export function generateQuizCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // removed ambiguous I/1/O/0
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Format a date relative to now
 */
/**
 * Strip markdown symbols, formatting artifacts, and unwanted characters.
 * Used to clean AI-generated text before displaying to users.
 */
export function cleanText(text: string): string {
  if (!text) return "";
  let s = text;
  // Strip markdown formatting
  s = s.replace(/\*\*(.*?)\*\*/g, "$1");       // **bold**
  s = s.replace(/\*(.*?)\*/g, "$1");            // *italic*
  s = s.replace(/~~(.*?)~~/g, "$1");             // ~~strikethrough~~
  s = s.replace(/`(.*?)`/g, "$1");               // `code`
  s = s.replace(/^#{1,6}\s+/gm, "");             // ### headings
  s = s.replace(/^[-*+]\s+/gm, "");              // - bullet list
  s = s.replace(/^\d+\.\s+/gm, "");             // 1. numbered list
  s = s.replace(/^>\s+/gm, "");                  // > blockquote
  // Strip dollar signs (LaTeX math)
  s = s.replace(/\$\$(.*?)\$\$/g, "$1");       // $$math$$
  s = s.replace(/\$(.*?)\$/g, "$1");            // $math$
  s = s.replace(/\$/g, "");                      // stray $
  // Strip other unwanted characters
  s = s.replace(/\u200B/g, "");                  // zero-width space
  s = s.replace(/\u200C/g, "");                  // zero-width non-joiner
  s = s.replace(/\u200D/g, "");                  // zero-width joiner
  s = s.replace(/\uFEFF/g, "");                  // BOM
  // Clean up multiple spaces
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

export function formatRelativeDate(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
