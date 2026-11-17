/**
 * Per-question analytics from recorded attempts.
 *
 * Every cut-off here is a published convention or a statistical test, not a
 * number picked by eye:
 *
 *  - "the stored key is wrong" has two independent tests, either of which is
 *    enough: (a) the observed number correct is significantly *below* the
 *    chance level of the question (1/k options), which cannot happen when the
 *    key is right; (b) the key is not the most-chosen answer and a sign test
 *    over the key-versus-most-chosen pair is significant at 2%. (b) is what
 *    catches the common case where the cohort answers the true option and a
 *    handful of guesses still land on the key. Under a correct key the key is
 *    the modal answer, so the sign test stays quiet.
 *  - "does not discriminate" uses the point-biserial correlation between the
 *    item and the total score (r_pb = (M₁ − M₀)/SD · √(pq)) with Ebel's
 *    conventional 0.20 floor, computed only where n ≥ 10 and 0.2 ≤ p ≤ 0.9 —
 *    at the extremes every item has low discrimination by construction, so
 *    flagging there would be noise.
  * - difficulty bands follow Ebel's widely used scale (≤0.2 very difficult,
 *    0.2–0.4 difficult, 0.4–0.6 average, 0.6–0.8 easy, >0.8 very easy).
 *
 * Measured on simulated cohorts of 20 (npm run check:items): a wrong key is
 * reported in 94% of cohorts where most students know the material, a cohort
 * that guessed everything raises the alarm 0.5% of the time, and a hard but
 * fair item 1%. Those numbers, not the nominal alphas, are what the thresholds
 * were chosen against.
 *
 * Pure and dependency-free so the rates can be checked by simulation.
 */

export type ItemFlag = "no_data" | "likely_wrong_key" | "not_discriminating";

/** Ebel's difficulty scale, as a descriptive band rather than a defect. */
export type DifficultyBand = "very_difficult" | "difficult" | "average" | "easy" | "very_easy";

export interface OptionTally {
  value: string;
  count: number;
  isKey: boolean;
}

export interface ItemStat {
  questionId: string;
  index: number;
  /** Completed attempts in which this question was answered. */
  answered: number;
  correct: number;
  /** Share correct, 0–1. */
  pValue: number;
  /** 1/k for a choice question, null where chance cannot be stated. */
  chanceLevel: number | null;
  /** One-sided P(X ≤ correct | chance). */
  belowChanceP: number | null;
  /** Point-biserial correlation with the total score, −1…1. */
  discrimination: number | null;
  /** The most-chosen option that is not the key, when it outdraws the key. */
  modalDistractor: OptionTally | null;
  /** One-sided sign-test P(key ≤ observed | 50/50 against the modal answer). */
  keyVersusModalP: number | null;
  band: DifficultyBand;
  flag: ItemFlag | null;
  figureKind: string | null;
  hasPreamble: boolean;
}

export interface FigureBreakdown {
  /** A figure kind ("bar", "table", "diagram", …) or "none". */
  key: string;
  answered: number;
  correct: number;
  pValue: number;
}

export interface ItemAnalytics {
  items: ItemStat[];
  byFigure: FigureBreakdown[];
  /** Items worth re-reading before the next sitting. */
  suspicious: ItemStat[];
  attemptsWithAnswers: number;
}

interface AttemptLike {
  score_percentage?: number | null;
  answers?: Record<string, string | null> | null;
  attempt_answers?:
    | {
        question_id: string;
        selected_answer: string | null;
        is_correct: boolean | null;
      }[]
    | null;
}

interface QuestionLike {
  id: string;
  correct_answer?: string | null;
  options?: string[] | null;
  question_type?: string | null;
  figure?: { kind?: string | null } | null;
  preamble?: string | null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * One-sided binomial floor: P(observed ≤ k) for Binomial(n, chance). 1% rather
 * than the usual 5% because a genuinely chance-level cohort (a hard item that
 * everyone guesses) produces a low count often enough to blame the key at 5%.
 */
export const WRONG_KEY_ALPHA = 0.01;
/** Ebel: a point-biserial under 0.20 contributes little to the total. */
export const MIN_DISCRIMINATION = 0.2;
/** Below this sample an item-total correlation is too unstable to act on. */
export const MIN_FOR_DISCRIMINATION = 10;
/**
 * A non-key option must be chosen by half the respondents before its lead over
 * a low-scoring key is treated as evidence. At 0.4 a hard-but-fair item was
 * occasionally blamed (1 in 100 simulated cohorts); at 0.5 it was not, and
 * detection of a real wrong key was unchanged.
 */
export const MODAL_SHARE = 0.5;
export const MIN_FOR_MODAL = 8;
/**
 * Significance of the key-versus-most-chosen sign test. Tight on purpose: at
 * n = 20 a *guessing* cohort occasionally produces the same shape as a broken
 * key, and the measured false-alarm rate at 0.05 was 6% — one nuisance alarm in
 * every ~17 items. At 0.01 detection fell to 82% because six guessers can still
 * put four answers on the key. At 0.02 the measured rates are ~3% false alarms
 * and ~92% detection for a cohort that mostly knows the material; the numbers
 * are printed by scripts/check-items.ts rather than assumed.
 */
export const MODAL_ALPHA = 0.02;
/** Discrimination is only judged away from the difficulty extremes. */
const BAND_FLOOR = 0.2;
const BAND_CEILING = 0.9;

const lnFactCache: number[] = [0];
function lnFact(n: number): number {
  for (let i = lnFactCache.length; i <= n; i++) {
    lnFactCache[i] = lnFactCache[i - 1] + Math.log(i);
  }
  return lnFactCache[n];
}

/** P(X ≤ successes) for X ~ Binomial(trials, p), summed in log space. */
export function binomialLowerTail(successes: number, trials: number, p: number): number {
  if (trials <= 0) return 1;
  if (p <= 0) return successes >= 0 ? 1 : 0;
  if (p >= 1) return successes >= trials ? 1 : 0;
  let total = 0;
  const kmax = Math.min(successes, trials);
  for (let i = 0; i <= kmax; i++) {
    const lnTerm =
      lnFact(trials) - lnFact(i) - lnFact(trials - i) + i * Math.log(p) + (trials - i) * Math.log(1 - p);
    total += Math.exp(lnTerm);
  }
  return Math.min(1, total);
}

/**
 * Point-biserial correlation of one item with the total score.
 * r_pb = (M₁ − M₀) / SD · √(p·q) — the standard closed form.
 */
export function pointBiserial(
  correctScores: number[],
  incorrectScores: number[],
  allScores: number[]
): number | null {
  const n = correctScores.length + incorrectScores.length;
  if (n < 2 || correctScores.length === 0 || incorrectScores.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const m1 = mean(correctScores);
  const m0 = mean(incorrectScores);
  const overall = mean(allScores);
  const sd = Math.sqrt(allScores.reduce((a, b) => a + (b - overall) ** 2, 0) / allScores.length);
  if (sd === 0) return null;
  const p = correctScores.length / n;
  return ((m1 - m0) / sd) * Math.sqrt(p * (1 - p));
}

export function difficultyBand(pValue: number): DifficultyBand {
  if (pValue <= 0.2) return "very_difficult";
  if (pValue <= 0.4) return "difficult";
  if (pValue <= 0.6) return "average";
  if (pValue <= 0.8) return "easy";
  return "very_easy";
}

/** Chance level from the number of options, where the question is a choice. */
function chanceLevelFor(q: QuestionLike): number | null {
  if (q.question_type === "true_false") return 0.5;
  const options = q.options?.filter((o) => String(o ?? "").trim().length > 0) ?? [];
  if (q.question_type === "multiple_choice" && options.length >= 2) return 1 / options.length;
  return null;
}

export function analyseItems(
  questions: QuestionLike[],
  attempts: AttemptLike[]
): ItemAnalytics {
  // One record per attempt per question: what was chosen, and whether it counted.
  const graded = attempts
    .map((a) => {
      const picks = new Map<string, string>();
      const per = new Map<string, boolean>();
      for (const aa of a.attempt_answers ?? []) {
        if (aa.selected_answer == null) continue;
        picks.set(aa.question_id, String(aa.selected_answer));
        per.set(aa.question_id, aa.is_correct ?? false);
      }
      if (a.answers) {
        for (const q of questions) {
          if (per.has(q.id)) continue;
          const selected = a.answers[q.id];
          if (selected == null) continue;
          const value = String(selected);
          picks.set(q.id, value);
          per.set(q.id, norm(value) === norm(q.correct_answer));
        }
      }
      const gradedCount = per.size;
      const correctCount = [...per.values()].filter(Boolean).length;
      const score =
        typeof a.score_percentage === "number"
          ? a.score_percentage
          : gradedCount > 0
            ? (correctCount / gradedCount) * 100
            : 0;
      return { per, picks, score };
    })
    .filter((g) => g.per.size > 0);

  const items: ItemStat[] = questions.map((q, index) => {
    const correctScores: number[] = [];
    const incorrectScores: number[] = [];
    const tally = new Map<string, { count: number; value: string }>();
    let answered = 0;

    for (const g of graded) {
      const isCorrect = g.per.get(q.id);
      if (isCorrect === undefined) continue;
      answered++;
      (isCorrect ? correctScores : incorrectScores).push(g.score);
      const picked = g.picks.get(q.id);
      if (picked == null) continue;
      const key = norm(picked);
      const entry = tally.get(key) ?? { count: 0, value: picked };
      entry.count++;
      tally.set(key, entry);
    }

    const correct = correctScores.length;
    const pValue = answered > 0 ? correct / answered : 0;
    const chanceLevel = chanceLevelFor(q);
    const belowChanceP =
      chanceLevel != null && answered > 0
        ? binomialLowerTail(correct, answered, chanceLevel)
        : null;

    const keyOf = norm(q.correct_answer);
    const keyCount = tally.get(keyOf)?.count ?? 0;
    const wrongPicks = [...tally.entries()]
      .filter(([key]) => key !== keyOf)
      .sort((a, b) => b[1].count - a[1].count);
    const topWrong = wrongPicks[0];
    const modalDistractor =
      topWrong && answered >= MIN_FOR_MODAL && topWrong[1].count / answered >= MODAL_SHARE && topWrong[1].count > keyCount
        ? { value: topWrong[1].value, count: topWrong[1].count, isKey: false }
        : null;

    // Sign test: among the people who chose either the key or the most popular
    // other answer, is the key chosen significantly less often than a coin flip
    // would give? Under a correct key the key is the modal answer, so this is
    // one-sided against a broken key rather than a general "unpopular" alarm.
    const keyVersusModalP =
      modalDistractor && keyCount + modalDistractor.count >= MIN_FOR_MODAL
        ? binomialLowerTail(keyCount, keyCount + modalDistractor.count, 0.5)
        : null;

    const discrimination = pointBiserial(
      correctScores,
      incorrectScores,
      [...correctScores, ...incorrectScores]
    );

    let flag: ItemFlag | null = null;
    if (answered === 0) {
      flag = "no_data";
    } else if (
      (belowChanceP != null && belowChanceP < WRONG_KEY_ALPHA) ||
      (keyVersusModalP != null &&
        keyVersusModalP < MODAL_ALPHA &&
        // A broken key is chosen less often than random guessing would manage;
        // without this a guessing cohort trips the sign test on noise.
        (chanceLevel == null || keyCount / answered < chanceLevel))
    ) {
      flag = "likely_wrong_key";
    } else if (
      answered >= MIN_FOR_DISCRIMINATION &&
      discrimination !== null &&
      discrimination < MIN_DISCRIMINATION &&
      pValue > BAND_FLOOR &&
      pValue < BAND_CEILING
    ) {
      flag = "not_discriminating";
    }

    return {
      questionId: q.id,
      index,
      answered,
      correct,
      pValue,
      chanceLevel,
      belowChanceP,
      discrimination,
      modalDistractor,
      keyVersusModalP,
      band: difficultyBand(pValue),
      flag,
      figureKind: q.figure?.kind ?? null,
      hasPreamble: !!q.preamble,
    };
  });

  const buckets = new Map<string, { answered: number; correct: number }>();
  for (const item of items) {
    const key = item.figureKind ?? "none";
    const bucket = buckets.get(key) ?? { answered: 0, correct: 0 };
    bucket.answered += item.answered;
    bucket.correct += item.correct;
    buckets.set(key, bucket);
  }

  return {
    items,
    byFigure: [...buckets.entries()]
      .map(([key, v]) => ({
        key,
        answered: v.answered,
        correct: v.correct,
        pValue: v.answered > 0 ? v.correct / v.answered : 0,
      }))
      .sort((a, b) => b.answered - a.answered),
    suspicious: items.filter((i) => i.flag === "likely_wrong_key" || i.flag === "not_discriminating"),
    attemptsWithAnswers: graded.length,
  };
}

/** Short, human label for a flag. */
export function flagLabel(flag: ItemFlag | null): string | null {
  switch (flag) {
    case "likely_wrong_key":
      return "check the answer key";
    case "not_discriminating":
      return "separates nobody";
    default:
      return null;
  }
}
