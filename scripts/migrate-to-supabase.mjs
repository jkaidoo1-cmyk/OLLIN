#!/usr/bin/env node
/**
 * Migrate existing file-mode data (.ollin-*.json) into a connected Supabase project.
 *
 * Usage (run from the quizai/ directory):
 *   node scripts/migrate-to-supabase.mjs --dry-run   # preview only, no writes
 *   node scripts/migrate-to-supabase.mjs             # real migration
 *
 * Credentials are read from .env.local (uncommented) or the process environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (required — the anon key cannot create auth users)
 *
 * Order matters: profiles depend on auth users, courses depend on programs,
 * quizzes depend on profiles/courses, attempts depend on quizzes. File-mode
 * IDs (e.g. "admin-001") are remapped to real UUIDs so foreign keys stay
 * consistent. Auth users get the password stored in the file so everyone can
 * log in exactly as before.
 *
 * Safe to re-run: existing rows (by email / code / share_code / id) are
 * skipped, not duplicated.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loading (.env.local)
// ---------------------------------------------------------------------------
function loadEnv() {
  const env = { ...process.env };
  const envPath = join(ROOT, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      // Only uncommented lines — disabled credentials are stored commented out.
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SERVICE_KEY || SUPABASE_URL.includes("placeholder")) {
  console.error(`
✗ Supabase credentials not found or still placeholders.
  Set these in quizai/.env.local (uncommented) or your environment:
    NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service_role key>
  Then run:  node scripts/migrate-to-supabase.mjs
  Preview:   node scripts/migrate-to-supabase.mjs --dry-run
`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const strip = (v) => (v === undefined || v === "" ? null : v);
const iso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

function readJson(name, fallback) {
  const p = join(ROOT, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    console.warn(`  ! could not parse ${name} — skipping`);
    return fallback;
  }
}

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Deterministic UUID derived from a file-mode id (stable across re-runs). */
function stableUuid(id) {
  if (isUuid(id)) return id;
  const h = createHash("md5").update(String(id)).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "3" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
const results = [];
function track(step, migrated, skipped, failed, note = "") {
  results.push({ step, migrated, skipped, failed });
  const parts = [`✓ ${migrated} migrated`, `${skipped} skipped`];
  if (failed) parts.push(`✗ ${failed} FAILED`);
  console.log(`     ${parts.join(", ")}${note ? ` — ${note}` : ""}`);
}

async function insertChunked(table, rows) {
  let ok = 0;
  let lastError = null;
  for (const c of chunk(rows, 500)) {
    const { error } = await supabase.from(table).insert(c);
    if (error) {
      lastError = error;
      // Retry one-by-one so one bad row doesn't sink the whole batch.
      for (const row of c) {
        const { error: rowErr } = await supabase.from(table).insert(row);
        if (rowErr) {
          console.warn(`     ! ${table}: ${rowErr.message} (row: ${JSON.stringify(row).slice(0, 80)})`);
        } else ok++;
      }
    } else ok += c.length;
  }
  return { ok, error: lastError };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nOLLIN → Supabase migration${DRY_RUN ? "  (DRY RUN — nothing will be written)" : ""}`);
  console.log(`Project: ${SUPABASE_URL}\n`);

  // Quick connectivity + schema sanity check ----------------------------------
  const { error: pingError } = await supabase.from("profiles").select("id").limit(1);
  if (pingError) {
    console.error(`✗ Cannot read the profiles table: ${pingError.message}`);
    console.error("  Did you run supabase/schema.sql in the SQL Editor first?");
    process.exit(1);
  }
  console.log("✓ Connected; schema looks present\n");

  // Source data -----------------------------------------------------------------
  const rawUsers = readJson(".ollin-users.json", []);
  const rawPrograms = readJson(".ollin-programs.json", []);
  const rawCourses = readJson(".ollin-courses.json", []);
  const rawQuizzes = readJson(".ollin-quizzes.json", []);
  const rawQuestions = readJson(".ollin-questions.json", []);
  const rawSaved = readJson(".ollin-saved-quizzes.json", []);
  const rawAttempts = readJson(".ollin-attempts.json", []);
  const config = readJson(".ollin-config.json", {});
  const rawKeys = Array.isArray(config) ? config : config.api_keys || [];

  if (
    !rawUsers.length && !rawPrograms.length && !rawCourses.length &&
    !rawQuizzes.length && !rawQuestions.length && !rawAttempts.length && !rawKeys.length
  ) {
    console.log("Nothing to migrate — the .ollin-*.json files are empty or missing.");
    return;
  }

  // Existing server rows (for idempotent re-runs) --------------------------------
  const [{ data: exProfiles }, { data: exPrograms }, { data: exCourses },
    { data: exQuizzes }, { data: exSaved }, { data: exKeys }] = await Promise.all([
    supabase.from("profiles").select("id, email"),
    supabase.from("programs").select("id, code"),
    supabase.from("courses").select("id, code"),
    supabase.from("quizzes").select("id, share_code"),
    supabase.from("saved_quizzes").select("quiz_id, course_id"),
    supabase.from("api_keys").select("id"),
  ]);
  const profileByEmail = new Map((exProfiles || []).map((p) => [p.email.toLowerCase(), p.id]));
  const programByCode = new Map((exPrograms || []).map((p) => [p.code.toLowerCase(), p.id]));
  const courseByCode = new Map((exCourses || []).map((c) => [c.code.toLowerCase(), c.id]));
  const quizByCode = new Map((exQuizzes || []).map((q) => [q.share_code, q.id]));
  const savedPairs = new Set((exSaved || []).map((r) => `${r.quiz_id}|${r.course_id}`));
  const keyIds = new Set((exKeys || []).map((k) => k.id));

  // ID remaps --------------------------------------------------------------------
  const userIdMap = new Map();
  const programIdMap = new Map();
  const courseIdMap = new Map();
  const quizIdMap = new Map();
  const questionIdMap = new Map(); // file question id -> migrated uuid

  // 1. USERS → auth.users + profiles ---------------------------------------------
  console.log("1/8  Users (auth.users + profiles)");
  {
    let ok = 0, skipped = 0, failed = 0;
    for (const u of rawUsers) {
      const email = String(u.email || "").toLowerCase().trim();
      if (!email) { failed++; continue; }
      if (profileByEmail.has(email)) {
        userIdMap.set(u.id, profileByEmail.get(email));
        skipped++;
        continue;
      }
      if (DRY_RUN) { userIdMap.set(u.id, `dryrun:${u.id}`); ok++; continue; }

      // The password from the file is reused so logins keep working.
      const password = u.password || `Ollin-${Math.random().toString(36).slice(2, 12)}!`;
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: u.full_name || email.split("@")[0],
          role: u.role || "student",
          current_year: u.current_year ?? 1,
        },
      });

      if (error) {
        // Auth user already exists (e.g. created from the dashboard) — adopt it.
        const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = (listed?.users || []).find((x) => x.email.toLowerCase() === email);
        if (existing) {
          userIdMap.set(u.id, existing.id);
          skipped++;
        } else {
          console.warn(`     ! ${email}: ${error.message}`);
          failed++;
        }
        continue;
      }

      // The dashboard trigger creates the profile; upsert to fill all fields.
      const profile = {
        id: data.user.id,
        email,
        full_name: u.full_name || email.split("@")[0],
        role: u.role || "student",
        program_id: u.program_id ? programIdMap.get(u.program_id) || null : null,
        current_year: u.current_year ?? 1,
      };
      const { error: pErr } = await supabase.from("profiles").upsert(profile);
      if (pErr) console.warn(`     ! profile ${email}: ${pErr.message}`);
      userIdMap.set(u.id, data.user.id);
      ok++;
    }
    track("users", ok, skipped, failed);
  }

  // 2. PROGRAMS -------------------------------------------------------------------
  console.log("2/8  Programs");
  {
    let ok = 0, skipped = 0, failed = 0;
    const rows = [];
    for (const p of rawPrograms) {
      if (programByCode.has(String(p.code).toLowerCase())) {
        programIdMap.set(p.id, programByCode.get(String(p.code).toLowerCase()));
        skipped++;
        continue;
      }
      const newId = stableUuid(p.id);
      programIdMap.set(p.id, newId);
      rows.push({
        id: newId,
        code: p.code,
        name: p.name,
        department: strip(p.department),
        description: strip(p.description),
        created_at: iso(p.created_at) || new Date().toISOString(),
        updated_at: iso(p.updated_at) || new Date().toISOString(),
      });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("programs", rows);
      ok = inserted; failed = rows.length - inserted;
      if (error) console.warn(`     ! programs batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("programs", ok, skipped, failed);
  }

  // 3. COURSES --------------------------------------------------------------------
  console.log("3/8  Courses");
  {
    let ok = 0, skipped = 0, failed = 0;
    const rows = [];
    for (const c of rawCourses) {
      if (courseByCode.has(String(c.code).toLowerCase())) {
        courseIdMap.set(c.id, courseByCode.get(String(c.code).toLowerCase()));
        skipped++;
        continue;
      }
      const newId = stableUuid(c.id);
      courseIdMap.set(c.id, newId);
      rows.push({
        id: newId,
        code: c.code,
        name: c.name,
        description: strip(c.description),
        department: strip(c.department),
        program_id: c.program_id ? programIdMap.get(c.program_id) || null : null,
        year: c.year ?? null,
        created_at: iso(c.created_at) || new Date().toISOString(),
        updated_at: iso(c.updated_at) || new Date().toISOString(),
      });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("courses", rows);
      ok = inserted; failed = rows.length - inserted;
      if (error) console.warn(`     ! courses batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("courses", ok, skipped, failed);
  }

  // 4. QUIZZES --------------------------------------------------------------------
  console.log("4/8  Quizzes");
  {
    let ok = 0, skipped = 0, failed = 0;
    const rows = [];
    // Default owner for quizzes whose host is unknown: the first migrated admin.
    const fallbackHost =
      rawUsers.find((u) => u.role === "admin") && userIdMap.get(rawUsers.find((u) => u.role === "admin").id)
        ? userIdMap.get(rawUsers.find((u) => u.role === "admin").id)
        : userIdMap.get(rawUsers[0]?.id) || null;

    for (const q of rawQuizzes) {
      if (q.share_code && quizByCode.has(q.share_code)) {
        quizIdMap.set(q.id, quizByCode.get(q.share_code));
        skipped++;
        continue;
      }
      const hostId = userIdMap.get(q.host_id) || fallbackHost;
      if (!hostId) {
        console.warn(`     ! quiz "${q.title}" skipped — no owner available`);
        failed++;
        continue;
      }
      const newId = stableUuid(q.id);
      quizIdMap.set(q.id, newId);
      rows.push({
        id: newId,
        host_id: hostId,
        title: q.title || "Untitled Quiz",
        description: strip(q.description),
        share_code: q.share_code || `MIG-${stableUuid(q.id).slice(0, 6).toUpperCase()}`,
        time_limit_minutes: q.time_limit_minutes ?? null,
        max_attempts: q.max_attempts ?? 1,
        show_answers_after: q.show_answers_after || "after_completion",
        shuffle_questions: q.shuffle_questions ?? true,
        shuffle_options: q.shuffle_options ?? true,
        passing_score: q.passing_score ?? 60,
        starts_at: iso(q.starts_at),
        ends_at: iso(q.ends_at),
        status: q.status || "published",
        course_id: q.course_id ? courseIdMap.get(q.course_id) || null : null,
        material_id: strip(q.material_id),
        created_at: iso(q.created_at) || new Date().toISOString(),
        updated_at: iso(q.updated_at) || new Date().toISOString(),
      });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("quizzes", rows);
      ok = inserted; failed += rows.length - inserted;
      if (error) console.warn(`     ! quizzes batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("quizzes", ok, skipped, failed);
  }

  // 5. QUESTIONS ------------------------------------------------------------------
  console.log("5/8  Questions");
  {
    let ok = 0, skipped = 0, failed = 0;
    const rows = [];
    for (const q of rawQuestions) {
      const newQuizId = quizIdMap.get(q.quiz_id);
      if (!newQuizId) { skipped++; continue; }
      const correct = q.correct_answer ?? q.correctAnswer;
      if (correct === undefined || correct === null) { skipped++; continue; }
      // Explicit stable id so attempt answers can reference the right row.
      const newId = stableUuid(q.id || `${q.quiz_id}:${q.order_index ?? 0}:${String(q.question_text || q.question || "").slice(0, 40)}`);
      if (q.id) questionIdMap.set(q.id, newId);
      rows.push({
        id: newId,
        quiz_id: newQuizId,
        question_text: q.question_text || q.question || "(missing text)",
        question_type: q.question_type || q.type || "multiple_choice",
        options: q.options || null,
        correct_answer: String(correct),
        explanation: strip(q.explanation),
        topic: strip(q.topic),
        difficulty: q.difficulty || "medium",
        marks: q.marks ?? 1,
        order_index: q.order_index ?? 0,
        created_at: iso(q.created_at) || new Date().toISOString(),
      });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("questions", rows);
      ok = inserted; failed = rows.length - inserted;
      if (error) console.warn(`     ! questions batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("questions", ok, skipped, failed);
  }

  // 6. SAVED QUIZZES (admin → course links) ---------------------------------------
  console.log("6/8  Saved quizzes (course links)");
  {
    let ok = 0, skipped = 0, failed = 0;
    const rows = [];
    for (const s of rawSaved) {
      const quizId = quizIdMap.get(s.quiz_id);
      const courseId = courseIdMap.get(s.course_id);
      if (!quizId || !courseId) { skipped++; continue; }
      if (savedPairs.has(`${quizId}|${courseId}`)) { skipped++; continue; }
      rows.push({ quiz_id: quizId, course_id: courseId, saved_at: iso(s.saved_at) || new Date().toISOString() });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("saved_quizzes", rows);
      ok = inserted; failed = rows.length - inserted;
      if (error) console.warn(`     ! saved_quizzes batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("saved quizzes", ok, skipped, failed);
  }

  // 7. ATTEMPTS (+ answers if present) ---------------------------------------------
  console.log("7/8  Quiz attempts");
  {
    let ok = 0, skipped = 0, failed = 0;
    const attemptIdMap = new Map();
    const rows = [];
    for (const a of rawAttempts) {
      const quizId = quizIdMap.get(a.quiz_id);
      if (!quizId) { skipped++; continue; } // attempt for a quiz that no longer exists
      const newId = stableUuid(a.id);
      attemptIdMap.set(a.id, newId);
      rows.push({
        id: newId,
        quiz_id: quizId,
        participant_id: a.participant_id ? userIdMap.get(a.participant_id) || null : null,
        participant_name: strip(a.participant_name),
        started_at: iso(a.started_at) || new Date().toISOString(),
        completed_at: iso(a.completed_at),
        time_taken_seconds: a.time_taken_seconds ?? null,
        total_questions: a.total_questions ?? 0,
        correct_answers: a.correct_answers ?? 0,
        score_percentage: a.score_percentage ?? 0,
        marks_earned: a.marks_earned ?? 0,
        marks_total: a.marks_total ?? 0,
        status: a.status || "completed",
        created_at: iso(a.created_at) || new Date().toISOString(),
      });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("quiz_attempts", rows);
      ok = inserted; failed = rows.length - inserted;
      if (error) console.warn(`     ! attempts batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("attempts", ok, skipped, failed);

    // Per-question answers live in .ollin-answers.json (optional file)
    const rawAnswers = readJson(".ollin-answers.json", []);
    if (rawAnswers.length) {
      let aOk = 0, aSkipped = 0, aFailed = 0;
      const answerRows = [];
      for (const ans of rawAnswers) {
        const attemptId = attemptIdMap.get(ans.attempt_id);
        if (!attemptId) { aSkipped++; continue; }
        const qid = questionIdMap.get(ans.question_id);
        if (!qid) { aSkipped++; continue; } // question wasn't migrated
        answerRows.push({
          attempt_id: attemptId,
          question_id: qid,
          selected_answer: strip(ans.selected_answer),
          is_correct: ans.is_correct ?? null,
          marks_awarded: ans.marks_awarded ?? 0,
          answered_at: iso(ans.answered_at) || new Date().toISOString(),
        });
      }
      if (!DRY_RUN && answerRows.length) {
        const { ok: inserted } = await insertChunked("attempt_answers", answerRows);
        aOk = inserted; aFailed = answerRows.length - inserted;
      } else if (DRY_RUN) aOk = answerRows.length;
      track("attempt answers", aOk, aSkipped, aFailed);
    }
  }

  // 8. API KEYS ---------------------------------------------------------------------
  console.log("8/8  API keys");
  {
    let ok = 0, skipped = 0, failed = 0;
    const rows = [];
    for (const k of rawKeys) {
      if (keyIds.has(k.id)) { skipped++; continue; }
      rows.push({
        id: k.id || stableUuid(`key-${k.label}-${k.added_at}`),
        key: k.key,
        label: k.label || "Key",
        provider: k.provider === "groq" ? "groq" : "gemini",
        enabled: k.enabled ?? true,
        total_requests: k.total_requests ?? 0,
        total_input_tokens: k.total_input_tokens ?? 0,
        total_output_tokens: k.total_output_tokens ?? 0,
        estimated_cost_usd: k.estimated_cost_usd ?? 0,
        last_used_at: iso(k.last_used_at),
        added_at: iso(k.added_at) || new Date().toISOString(),
        last_error: strip(k.last_error),
        last_error_at: iso(k.last_error_at),
      });
    }
    if (!DRY_RUN && rows.length) {
      const { ok: inserted, error } = await insertChunked("api_keys", rows);
      ok = inserted; failed = rows.length - inserted;
      if (error) console.warn(`     ! api_keys batch: ${error.message}`);
    } else if (DRY_RUN) ok = rows.length;
    track("api keys", ok, skipped, failed);
  }

  // Summary ---------------------------------------------------------------------------
  const totals = results.reduce(
    (acc, r) => ({ migrated: acc.migrated + r.migrated, skipped: acc.skipped + r.skipped, failed: acc.failed + r.failed }),
    { migrated: 0, skipped: 0, failed: 0 }
  );
  console.log("\n" + "─".repeat(46));
  console.log("Summary");
  for (const r of results) {
    console.log(`  ${r.step.padEnd(16)} ✓${String(r.migrated).padStart(4)}  ·${String(r.skipped).padStart(4)}${r.failed ? `  ✗${String(r.failed).padStart(4)}` : ""}`);
  }
  console.log("─".repeat(46));
  console.log(`  TOTAL          ✓${String(totals.migrated).padStart(4)}  ·${String(totals.skipped).padStart(4)}${totals.failed ? `  ✗${String(totals.failed).padStart(4)}` : ""}`);

  if (DRY_RUN) {
    console.log("\nDry run complete — nothing was written. Run without --dry-run to migrate.");
  } else if (totals.failed > 0) {
    console.log("\n⚠ Finished with failures — review the messages above, fix, and re-run (it is safe to re-run).");
    process.exitCode = 2;
  } else {
    console.log("\n✓ Migration complete. Existing .ollin-*.json files were NOT modified or deleted.");
    console.log("  Log in with your previous email/password — accounts were carried over.");
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
