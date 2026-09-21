#!/usr/bin/env node
/**
 * OLLIN end-to-end API smoke tests.
 *
 * Runs against a LIVE dev server and exercises the core flows:
 *   auth → permissions → quiz create → grading → time windows →
 *   leaderboard → attempts/review → bulk import → audit log.
 *
 * Usage:
 *   node scripts/smoke.mjs [baseUrl]     # default http://localhost:63754
 *
 * The built-in admin login uses the ADMIN_PASSWORD env var if set,
 * otherwise the bundled default.
 */

const BASE = process.argv[2] || "http://localhost:63754";
const ADMIN_EMAIL = "jkaidoo1@mail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "OllinAdmin1598";

let passed = 0;
let failed = 0;
const failures = [];
const createdQuizIds = [];
const createdUserEmails = [];

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(path, { method = "GET", body, cookie, local } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body || local) headers["x-local-mode"] = "true";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
}

function extractCookie(setCookie) {
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}

// ─────────────────────────────────────────────────────────────
async function run() {
  console.log(`\nOLLIN smoke tests → ${BASE}\n`);

  // 1. Health
  console.log("Health:");
  const home = await fetch(`${BASE}/`).then((r) => r.status).catch(() => 0);
  ok("server responds", home === 200, `got ${home}`);
  const backend = await api("/api/backend-status");
  ok("backend-status endpoint works", backend.status === 200 && backend.json?.backend, JSON.stringify(backend.json));

  // 2. Auth
  console.log("\nAuth:");
  const badLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: "wrong-password" },
  });
  ok("wrong password rejected (401)", badLogin.status === 401, `got ${badLogin.status}`);

  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  ok("admin login succeeds", login.status === 200 && login.json?.user, `got ${login.status}`);
  const adminCookie = extractCookie(login.setCookie);
  ok("session cookie issued", !!adminCookie);

  const me = await api("/api/auth/me", { cookie: adminCookie });
  ok("session resolves (auth/me)", me.status === 200 && me.json?.user?.email === ADMIN_EMAIL, JSON.stringify(me.json));

  const noAuth = await api("/api/notifications");
  ok("anonymous blocked on notifications (401)", noAuth.status === 401, `got ${noAuth.status}`);

  // 3. Permissions
  console.log("\nPermissions:");
  const noAdminAudit = await api("/api/admin/audit");
  ok("anonymous blocked on audit (403)", noAdminAudit.status === 403, `got ${noAdminAudit.status}`);
  const adminAudit = await api("/api/admin/audit", { cookie: adminCookie });
  ok("admin can read audit log", adminAudit.status === 200 && Array.isArray(adminAudit.json?.events), `got ${adminAudit.status}`);

  // 4. Quiz creation (local file mode)
  console.log("\nQuiz creation:");
  const quiz = {
    title: `Smoke quiz ${Date.now()}`,
    description: null,
    share_code: `SMK${Date.now().toString(36).toUpperCase().slice(-5)}`,
    time_limit_minutes: null,
    passing_score: 60,
    status: "published",
    starts_at: null,
    ends_at: null,
    host_id: "admin-001",
    course_id: null,
    max_attempts: 1,
    show_answers_after: "after_completion",
    shuffle_questions: false,
    shuffle_options: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const questions = [
    {
      id: `local-q-${Date.now()}-a`,
      quiz_id: quiz.id || quiz.share_code,
      question_text: "What is 2 + 2?",
      question_type: "multiple_choice",
      options: ["3", "4", "5", "6"],
      correct_answer: "1",
      explanation: "Basic arithmetic",
      topic: null,
      difficulty: "easy",
      marks: 1,
      order_index: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: `local-q-${Date.now()}-b`,
      quiz_id: quiz.id || quiz.share_code,
      question_text: "Is the sky blue?",
      question_type: "true_false",
      options: null,
      correct_answer: "true",
      explanation: null,
      topic: null,
      difficulty: "easy",
      marks: 1,
      order_index: 1,
      created_at: new Date().toISOString(),
    },
  ];
  const created = await api("/api/quizzes", {
    method: "POST",
    body: { title: quiz.title, quiz, questions },
  });
  ok("quiz saved via API", created.status === 200, JSON.stringify(created.json).slice(0, 120));
  const quizId = created.json?.quiz?.id || created.json?.quiz?.quiz?.id || quiz.share_code;
  createdQuizIds.push(quizId);
  ok("quiz id returned", !!quizId);

  // 5. Answer-leak protection
  console.log("\nAnswer security:");
  const anonQ = await api(`/api/quizzes/${quizId}/questions`);
  const anonQuestions = anonQ.json?.questions || [];
  const leaked = anonQuestions.some((q) => q.correct_answer !== undefined && q.correct_answer !== null && q.correct_answer !== "");
  ok("anonymous question fetch strips correct answers", anonQ.status === 403 || !leaked, `status ${anonQ.status}, leaked=${leaked}`);

  // 6. Server-side grading
  console.log("\nServer-side grading:");
  const attemptId = `att-${Date.now()}-smoke`;
  const wrongSubmit = await api(`/api/attempts/${attemptId}/submit`, {
    method: "POST",
    body: {
      quiz_id: quizId,
      answers: [
        { question_id: questions[0].id, selected_answer: "0", is_correct: true, marks_awarded: 1 },
        { question_id: questions[1].id, selected_answer: "false", is_correct: true, marks_awarded: 1 },
      ],
    },
  });
  ok("submission accepted", wrongSubmit.status === 200, JSON.stringify(wrongSubmit.json).slice(0, 120));
  const wrongScore = wrongSubmit.json?.attempt?.score_percentage ?? wrongSubmit.json?.attempt?.score;
  ok("client-claimed correctness ignored (score 0)", wrongScore === 0, `score=${wrongScore}`);

  const rightAttemptId = `att-${Date.now()}-ok`;
  const rightSubmit = await api(`/api/attempts/${rightAttemptId}/submit`, {
    method: "POST",
    body: {
      quiz_id: quizId,
      answers: [
        { question_id: questions[0].id, selected_answer: "1", is_correct: false, marks_awarded: 0 },
        { question_id: questions[1].id, selected_answer: "true", is_correct: false, marks_awarded: 0 },
      ],
    },
  });
  const rightScore = rightSubmit.json?.attempt?.score_percentage ?? rightSubmit.json?.attempt?.score;
  ok("server grades correct answers (score 100)", rightScore === 100, `score=${rightScore}`);

  // 7. Time windows
  console.log("\nTime windows:");
  const closedQuiz = { ...quiz, title: `Closed ${Date.now()}`, share_code: `CLZ${Date.now().toString(36).toUpperCase().slice(-5)}`, ends_at: new Date(Date.now() - 3600_000).toISOString() };
  const closedQ = questions.map((q) => ({ ...q, id: q.id + "-c", quiz_id: closedQuiz.share_code }));
  const closedCreated = await api("/api/quizzes", {
    method: "POST",
    body: { title: closedQuiz.title, quiz: closedQuiz, questions: closedQ },
  });
  const closedId = closedCreated.json?.quiz?.id || closedCreated.json?.quiz?.quiz?.id || closedQuiz.share_code;
  createdQuizIds.push(closedId);
  const closedSubmit = await api(`/api/attempts/att-${Date.now()}-closed/submit`, {
    method: "POST",
    body: {
      quiz_id: closedId,
      answers: [{ question_id: closedQ[0].id, selected_answer: "1" }],
    },
  });
  ok("submission to ended quiz refused (403)", closedSubmit.status === 403, `got ${closedSubmit.status}`);

  // 8. Leaderboard
  console.log("\nLeaderboard:");
  const lb = await api(`/api/quizzes/${quizId}/leaderboard`);
  ok("leaderboard returns ranked attempts", lb.status === 200 && Array.isArray(lb.json?.leaders) && lb.json.leaders.length >= 2, JSON.stringify(lb.json).slice(0, 100));
  const first = lb.json?.leaders?.[0];
  ok("best score ranked first (100%)", first?.score === 100, `top=${first?.score}`);

  // 9. Attempt review permissions
  console.log("\nAttempt review:");
  const anonReview = await api(`/api/attempts/${rightAttemptId}/review`);
  ok("anonymous review blocked (401)", anonReview.status === 401, `got ${anonReview.status}`);
  const adminReview = await api(`/api/attempts/${rightAttemptId}/review`, { cookie: adminCookie });
  ok("admin can review an attempt", adminReview.status === 200 && Array.isArray(adminReview.json?.questions), `got ${adminReview.status}`);

  // 10. My attempts
  console.log("\nMy attempts:");
  const anonMine = await api("/api/attempts?mine=true");
  ok("anonymous mine=true blocked (401)", anonMine.status === 401, `got ${anonMine.status}`);

  // 11. Bulk import
  console.log("\nBulk import:");
  const stamp = Date.now();
  const bulk = await api("/api/admin/users/bulk", {
    method: "POST",
    cookie: adminCookie,
    body: {
      csv: [
        `${ADMIN_EMAIL},Dup Admin,student,,1,ignoreme`, // duplicate → skipped
        `smoke.student.${stamp}@test.edu,Smoke Student,student,,1,S4fePass!x`,
        `not-an-email,Bad Row,student`, // invalid → skipped
      ].join("\n"),
    },
  });
  ok("bulk import succeeds", bulk.status === 200, JSON.stringify(bulk.json).slice(0, 120));
  ok("duplicate email skipped", bulk.json?.skipped?.some((s) => s.reason?.includes("exists")), JSON.stringify(bulk.json?.skipped));
  ok("invalid email skipped", bulk.json?.skipped?.some((s) => s.reason?.includes("Invalid")), JSON.stringify(bulk.json?.skipped));
  ok("valid row created with temp password", bulk.json?.created?.[0]?.temp_password?.length >= 8, JSON.stringify(bulk.json?.created));
  for (const u of bulk.json?.created || []) {
    if (u.email) createdUserEmails.push(u.email);
  }

  const anonBulk = await api("/api/admin/users/bulk", { method: "POST", body: { csv: "a@b.c,Test,student" } });
  ok("anonymous bulk import blocked (403)", anonBulk.status === 403, `got ${anonBulk.status}`);

  // 12. Audit log recorded the actions
  console.log("\nAudit:");
  const auditAfter = await api("/api/admin/audit", { cookie: adminCookie });
  const events = auditAfter.json?.events || [];
  ok("bulk import audited", events.some((e) => e.action === "user.bulk_import"), JSON.stringify(events.slice(0, 2)).slice(0, 120));

  // 13. Session revocation
  console.log("\nSession revocation:");
  const logout = await api("/api/auth/logout", { method: "POST", cookie: adminCookie });
  ok("logout succeeds", logout.status === 200, `got ${logout.status}`);
  const afterLogout = await api("/api/auth/me", { cookie: adminCookie });
  ok("session revoked after logout", afterLogout.status !== 200 || !afterLogout.json?.user, `status=${afterLogout.status}`);

  // Re-login for cleanliness
  const reLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  ok("re-login after logout works", reLogin.status === 200, `got ${reLogin.status}`);

  // 14. Cleanup — delete everything this run created
  console.log("\nCleanup:");
  const cleanupCookie = extractCookie(reLogin.setCookie) || adminCookie;
  let cleaned = 0;
  for (const id of createdQuizIds) {
    const del = await api(`/api/quizzes/${id}`, { method: "DELETE", cookie: cleanupCookie, local: true });
    if (del.status === 200 || del.status === 204) cleaned++;
  }
  for (const email of createdUserEmails) {
    const list = await api("/api/admin/users", { cookie: cleanupCookie, local: true });
    const match = (list.json?.users || list.json || []).find?.((u) => u.email === email);
    const uid = match?.id;
    const del = uid
      ? await api(`/api/admin/users?id=${encodeURIComponent(uid)}`, { method: "DELETE", cookie: cleanupCookie, local: true })
      : { status: 404 };
    if (del.status === 200 || del.status === 204) cleaned++;
  }
  console.log(`  deleted ${cleaned}/${createdQuizIds.length + createdUserEmails.length} test artifacts`);

  // ─────────────────────────────────────────────────────────────
  console.log(`\n════════════════════════════════════`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("Failed:", failures.join(", "));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Smoke test runner crashed:", err);
  process.exit(1);
});
