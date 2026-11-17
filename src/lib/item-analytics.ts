/**
 * Per-question analytics from recorded attempts.
 *
 * Everything needed to judge an item is already stored — quiz_attempts has the
 * score, attempt_answers (or a selections record) has what each participant
 * chose — but nothing turned that into a diagnosis. Two things matter more than
 * a raw success rate:
 *
 *   - a key that is simply wrong marks everyone wrong, which looks like "a hard
 *     question" in a bare percentage;
 *   - an item nobody separates on (strong and weak students score the same)
 *     measures nothing.
 *
 * Pure and dependency-free so the thresholds can be checked directly.
 */

export type ItemFlag = "no_data" | "likely_wrong_key" | "too_easy" | "weak";

export interface ItemStat {
  questionId: string;
  index: number;
  /** Completed attempts in which this question was answered. */
  answered: number;
  correct: number;
  /** Share correct, 0–1. */
  pValue: number;
  /** Top third minus bottom third on overall score, or null without enough data. */
  discrimination: number | null;
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
  figure?: { kind?: string | null } | null;
  preamble?: string | null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Minimum answers before a flag is allowed to fire. */
const MIN_FOR_KEY_ALARM = 5;
const MIN_FOR_DISCRIMINATION = 6;

function flagFor(answered: number, pValue: number, discrimination: number | null): ItemFlag | null {
  if (answered === 0) return "no_data";
  // Nearly nobody right, with enough data to be a pattern: the stored key is
  // wrong more often than the whole cohort is.
  if (answered >= MIN_FOR_KEY_ALARM && pValue <= 0.15) return "likely_wrong_key";
  if (answered >= MIN_FOR_KEY_ALARM && pValue >= 0.98) return "too_easy";
  // Separates nobody: strong and weak students do equally well on it.
  if (answered >= MIN_FOR_DISCRIMINATION && discrimination !== null && discrimination < 0.1) {
    return "weak";
  }
  return null;
}

export function analyseItems(
  questions: QuestionLike[],
  attempts: AttemptLike[]
): ItemAnalytics {
  // One correctness map per attempt, so a question can be joined by id.
  const graded = attempts
    .map((a) => {
      const per = new Map<string, boolean>();
      for (const aa of a.attempt_answers ?? []) {
        if (aa.selected_answer == null) continue;
        per.set(aa.question_id, aa.is_correct ?? false);
      }
      if (a.answers) {
        for (const q of questions) {
          if (per.has(q.id)) continue;
          const selected = a.answers[q.id];
          if (selected == null) continue;
          per.set(q.id, norm(selected) === norm(q.correct_answer));
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
      return { per, score };
    })
    .filter((g) => g.per.size > 0);

  // Strong vs weak comparison only means something with a spread of scores.
  const sorted = [...graded].sort((x, y) => y.score - x.score);
  const third = Math.floor(sorted.length / 3);
  const top = third >= 1 ? sorted.slice(0, third) : [];
  const bottom = third >= 1 ? sorted.slice(-third) : [];

  const items: ItemStat[] = questions.map((q, index) => {
    let answered = 0;
    let correct = 0;
    for (const g of graded) {
      const isCorrect = g.per.get(q.id);
      if (isCorrect === undefined) continue;
      answered++;
      if (isCorrect) correct++;
    }
    let topN = 0;
    let topCorrect = 0;
    for (const g of top) {
      const c = g.per.get(q.id);
      if (c === undefined) continue;
      topN++;
      if (c) topCorrect++;
    }
    let botN = 0;
    let botCorrect = 0;
    for (const g of bottom) {
      const c = g.per.get(q.id);
      if (c === undefined) continue;
      botN++;
      if (c) botCorrect++;
    }
    const pValue = answered > 0 ? correct / answered : 0;
    const discrimination = topN > 0 && botN > 0 ? topCorrect / topN - botCorrect / botN : null;

    return {
      questionId: q.id,
      index,
      answered,
      correct,
      pValue,
      discrimination,
      flag: flagFor(answered, pValue, discrimination),
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
    suspicious: items.filter((i) => i.flag === "likely_wrong_key" || i.flag === "weak"),
    attemptsWithAnswers: graded.length,
  };
}

/** Short, human label for a flag. */
export function flagLabel(flag: ItemFlag | null): string | null {
  switch (flag) {
    case "likely_wrong_key":
      return "check the answer key";
    case "too_easy":
      return "too easy";
    case "weak":
      return "separates nobody";
    case "no_data":
      return null;
    default:
      return null;
  }
}
