/**
 * Calibrates the item-analytics thresholds against known ground truth.
 *
 * The point of this file: the flags must fire when the answer key really is
 * wrong and must stay quiet otherwise. Each scenario below is a cohort
 * simulated from a stated model (ability → total score → choice), so the
 * alarm rate can be measured over many seeds rather than assumed.
 *
 * Run: npm run check:items
 */

import {
  analyseItems,
  binomialLowerTail,
  pointBiserial,
  difficultyBand,
  flagLabel,
  WRONG_KEY_ALPHA,
  MIN_DISCRIMINATION,
} from "../src/lib/item-analytics.ts";

let checks = 0;
let failures = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`✗ ${label}\n    expected ${e}\n    actual   ${a}`);
  }
}

function ok(label: string, condition: boolean, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.error(`✗ ${label} ${detail}`);
  }
}

function near(label: string, actual: number | null, expected: number, tolerance = 0.005) {
  checks++;
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    failures++;
    console.error(`✗ ${label}: expected ≈${expected}, actual ${actual}`);
  }
}

// Deterministic PRNG so a failure is reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Statistics ───────────────────────────────────────────
// P(X ≤ 0 | n=10, p=0.25) = 0.75^10
near("binomial tail at zero successes", binomialLowerTail(0, 10, 0.25), 0.75 ** 10);
// P(X ≤ 10 | n=10, p=0.25) = 1
near("binomial tail at the ceiling", binomialLowerTail(10, 10, 0.25), 1);
// P(X ≤ 2 | n=4, p=0.5) = (1 + 4 + 6)/16
near("binomial tail, small case", binomialLowerTail(2, 4, 0.5), 11 / 16);
ok("a half-right cohort at chance is not surprising", binomialLowerTail(5, 20, 0.25) > 0.6);

// r_pb by hand: correct scores [10,10], wrong [0,0], p = 0.5
near("point-biserial, perfect split", pointBiserial([10, 10], [0, 0], [10, 10, 0, 0]), 1);
eq("point-biserial, no variance", pointBiserial([5, 5], [5, 5], [5, 5, 5, 5]), null);
// M₁ = 7.5, M₀ = 4.5, SD = √2.5, p = 0.5 → 3/1.5811 · 0.5
eq(
  "point-biserial, mild signal",
  Math.round((pointBiserial([8, 7], [4, 5], [8, 7, 4, 5]) ?? 0) * 1000) / 1000,
  0.949
);

eq("band: very difficult", difficultyBand(0.1), "very_difficult");
eq("band: difficult", difficultyBand(0.35), "difficult");
eq("band: average", difficultyBand(0.5), "average");
eq("band: easy", difficultyBand(0.75), "easy");
eq("band: very easy", difficultyBand(0.95), "very_easy");

// ─── Simulated cohorts ────────────────────────────────────
const OPTIONS = ["a", "b", "c", "d"];
const KEY = "b";
/** The option that is actually correct when the stored key is wrong. */
const TRUE_ANSWER = "c";

interface Student {
  ability: number;
  score: number;
}

function cohort(n: number): Student[] {
  return Array.from({ length: n }, (_, i) => {
    const ability = (i + 0.5) / n;
    return { ability, score: ability * 100 };
  });
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    correct_answer: KEY,
    options: OPTIONS,
    question_type: "multiple_choice",
    figure: null,
    preamble: null,
    ...overrides,
  };
}

/**
 * Each student answers correctly when their ability clears the item's
 * difficulty; otherwise they pick a random wrong option.
 */
function answersFor(
  students: Student[],
  opts: { difficulty: number; recordAs: string; seed: number; guessOnly?: boolean }
) {
  const random = rng(opts.seed);
  return students.map((s) => {
    const solved = opts.guessOnly ? false : s.ability > opts.difficulty;
    let pick: string;
    if (solved) {
      pick = opts.recordAs;
    } else {
      const wrong = OPTIONS.filter((o) => o !== opts.recordAs);
      pick = wrong[Math.floor(random() * wrong.length)];
    }
    return { score_percentage: s.score, answers: { q1: pick }, attempt_answers: [] };
  });
}

// 1. Honest item, cohort spread across ability: no alarm, strong correlation.
{
  const students = cohort(20);
  const attempts = answersFor(students, { difficulty: 0.5, recordAs: KEY, seed: 11 });
  const stat = analyseItems([question()], attempts).items[0];
  eq("honest item: no flag", stat.flag, null);
  ok("honest item: separates the cohort", (stat.discrimination ?? 0) > 0.4, `r=${stat.discrimination}`);
  ok("honest item: below-chance test is not significant", (stat.belowChanceP ?? 0) > 0.5);
}

// 2. Wrong stored key: the cohort answers the truly-correct option.
{
  const students = cohort(20);
  // Most of the cohort knows the material, so the true option dominates.
  const attempts = answersFor(students, { difficulty: 0.3, recordAs: TRUE_ANSWER, seed: 12 });
  const stat = analyseItems([question()], attempts).items[0];
  eq("wrong key: flagged", stat.flag, "likely_wrong_key");
  ok("wrong key: the key is chosen less than random", stat.correct / stat.answered < 0.25);
  eq("wrong key: the chosen option is reported", stat.modalDistractor?.value, TRUE_ANSWER);
  // Guessing alone can land on the key a few times, so the sign test — not the
  // below-chance test — is what decides here.
  ok("wrong key: key outdraws the modal answer", (stat.keyVersusModalP ?? 1) < 0.05);
  eq("wrong key: label reads plainly", flagLabel(stat.flag), "check the answer key");
}

// 3. Wrong key in reverse: the key is one of the distractors and most students
//    pick a different option, without the cohort scoring below chance.
{
  const students = cohort(20);
  const random = rng(13);
  const attempts = students.map((s) => {
    const knows = s.ability > 0.3;
    const pick = knows ? TRUE_ANSWER : OPTIONS[Math.floor(random() * OPTIONS.length)];
    return { score_percentage: s.score, answers: { q1: pick }, attempt_answers: [] };
  });
  const stat = analyseItems([question()], attempts).items[0];
  eq("wrong key, above-chance noise: still flagged", stat.flag, "likely_wrong_key");
}

// 4. Pure guessing: the cohort has no idea. Chance-level performance must not
//    be reported as a broken key.
{
  let alarms = 0;
  const seeds = 200;
  for (let seed = 0; seed < seeds; seed++) {
    const students = cohort(20);
    const random = rng(seed + 1);
    const attempts = students.map((s) => ({
      score_percentage: s.score,
      answers: { q1: OPTIONS[Math.floor(random() * OPTIONS.length)] },
      attempt_answers: [],
    }));
    if (analyseItems([question()], attempts).items[0].flag === "likely_wrong_key") alarms++;
  }
  console.log(`  calibrated: guessing cohort alarms ${alarms}/${seeds} (${(alarms / seeds).toFixed(3)})`);
  ok(
    `guessing cohort: wrong-key alarm stays rare (${alarms}/${seeds})`,
    alarms / seeds <= WRONG_KEY_ALPHA,
    `rate ${(alarms / seeds).toFixed(3)}`
  );
}

// 5. Peaked item: everyone knows it. Not a defect, and not "wrong key".
{
  const students = cohort(20);
  const attempts = students.map((s) => ({
    score_percentage: s.score,
    answers: { q1: KEY },
    attempt_answers: [],
  }));
  const stat = analyseItems([question()], attempts).items[0];
  eq("everyone correct: no flag", stat.flag, null);
  eq("everyone correct: banded very easy", stat.band, "very_easy");
}

// 6. Item unrelated to ability: same share right in strong and weak thirds.
{
  let flagged = 0;
  const seeds = 50;
  for (let seed = 0; seed < seeds; seed++) {
    const students = cohort(30);
    const random = rng(seed + 500);
    const attempts = students.map((s) => ({
      score_percentage: s.score,
      answers: { q1: random() < 0.5 ? KEY : "a" },
      attempt_answers: [],
    }));
    const stat = analyseItems([question()], attempts).items[0];
    if (stat.flag === "not_discriminating") flagged++;
  }
  ok(
    `ability-blind item: usually flagged (${flagged}/${seeds})`,
    flagged / seeds > 0.6,
    `rate ${(flagged / seeds).toFixed(2)}`
  );
}

// 7. Extremes are exempt: an easy item cannot discriminate by construction, so
//    it must not be reported as a defect.
{
  const students = cohort(30);
  const attempts = students.map((s, i) => ({
    score_percentage: s.score,
    answers: { q1: i < 28 ? KEY : "a" },
    attempt_answers: [],
  }));
  const stat = analyseItems([question()], attempts).items[0];
  eq("very easy item: not called undiscriminating", stat.flag, null);
  ok("very easy item still reports its r", stat.discrimination !== null);
}

// 8. Small samples cannot trigger the correlation flag.
{
  const students = cohort(6);
  const random = rng(77);
  const attempts = students.map((s) => ({
    score_percentage: s.score,
    answers: { q1: random() < 0.5 ? KEY : "a" },
    attempt_answers: [],
  }));
  eq("six answers is not enough to judge discrimination", analyseItems([question()], attempts).items[0].flag, null);
}

// 9. Chance level follows the number of options; open answers have none.
eq("chance level: 4 options", analyseItems([question()], []).items[0].chanceLevel, 0.25);
eq(
  "chance level: true/false",
  analyseItems([question({ options: ["True", "False"], question_type: "true_false" })], []).items[0]
    .chanceLevel,
  0.5
);
eq(
  "chance level: short answer is unknown",
  analyseItems([question({ options: null, question_type: "short_answer" })], []).items[0].chanceLevel,
  null
);

// 10. A short-answer item whose key is wrong still gets caught, by the
//     model-free majority rule.
{
  const students = cohort(20);
  const attempts = students.map((s) => ({
    score_percentage: s.score,
    answers: { q1: s.ability > 0.2 ? "0.5 V" : "0.25 V" },
    attempt_answers: [],
  }));
  const stat = analyseItems(
    [question({ correct_answer: "0.25 V", options: null, question_type: "short_answer" })],
    attempts
  ).items[0];
  eq("short answer with a wrong key: flagged", stat.flag, "likely_wrong_key");
}

// 11. Graded arrays win over the raw selections.
eq(
  "graded answers are trusted",
  analyseItems(
    [question()],
    [
      {
        score_percentage: 100,
        answers: { q1: "a" },
        attempt_answers: [{ question_id: "q1", selected_answer: KEY, is_correct: true }],
      },
    ]
  ).items[0].correct,
  1
);

// 12. Detection power: a cohort that mostly knows the material contradicts a
//     wrong key almost every time.
{
  let hits = 0;
  const seeds = 100;
  for (let seed = 0; seed < seeds; seed++) {
    const students = cohort(20);
    const attempts = answersFor(students, { difficulty: 0.3, recordAs: TRUE_ANSWER, seed: seed + 900 });
    if (analyseItems([question()], attempts).items[0].flag === "likely_wrong_key") hits++;
  }
  console.log(`  calibrated: wrong key detected ${hits}/${seeds}`);
  ok(`wrong key detection (${hits}/${seeds})`, hits / seeds >= 0.9, `rate ${(hits / seeds).toFixed(2)}`);
}

// 13. A hard but fair item must not be called a broken key: the guessing noise
//     spreads across the options, so no distractor dominates.
{
  let falseAlarms = 0;
  const seeds = 100;
  for (let seed = 0; seed < seeds; seed++) {
    const students = cohort(20);
    const attempts = answersFor(students, { difficulty: 0.85, recordAs: KEY, seed: seed + 1300 });
    if (analyseItems([question()], attempts).items[0].flag === "likely_wrong_key") falseAlarms++;
  }
  console.log(`  calibrated: hard-but-fair item alarmed ${falseAlarms}/${seeds}`);
  // Not zero by construction: with twenty respondents and four options, one seed
  // in a hundred puts the key below chance while a distractor tops 50%. The
  // acceptance is the measured rate, and the doc comment quotes it.
  ok(
    `hard-but-fair item stays under 2% (${falseAlarms}/${seeds})`,
    falseAlarms / seeds <= 0.02,
    `rate ${(falseAlarms / seeds).toFixed(2)}`
  );
}

eq("thresholds are documented, not magic", MIN_DISCRIMINATION, 0.2);

console.log(
  failures === 0
    ? `item checks passed (${checks} assertions)`
    : `${failures} of ${checks} item checks failed`
);
process.exit(failures === 0 ? 0 : 1);
