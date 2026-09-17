/**
 * Server-side store for "quiz saved under course" associations.
 * Keeps these associations in a file so that students on any browser
 * can see quizzes the admin has saved to their courses.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface SavedQuizLink {
  quiz_id: string;
  course_id: string;
  saved_at: string;
}

function getSavedPath() {
  return join(process.cwd(), ".ollin-saved-quizzes.json");
}

export function readSavedQuizzes(): SavedQuizLink[] {
  const path = getSavedPath();
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch { /* ignore */ }
  }
  return [];
}

export function writeSavedQuizzes(links: SavedQuizLink[]) {
  writeFileSync(getSavedPath(), JSON.stringify(links, null, 2));
}
