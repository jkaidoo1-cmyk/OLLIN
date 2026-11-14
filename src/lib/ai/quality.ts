/**
 * Post-generation quality gate.
 *
 * The prompt states the standard, but a small model still slips through items a
 * teacher would reject: stems that ask "which of the following", options that
 * are all true, one option twice as long as the rest, the same fact asked
 * twice. Dropping those after generation is what makes the visible quiz — and
 * not just the instructions — hold the standard.
 *
 * These checks are deterministic and deliberately conservative: anything they
 * cannot judge (correctness, difficulty) is left alone.
 */

/** Stems that mark a low-effort generated question. */
const BANNED_STEMS: RegExp[] = [
  /^according to the (text|passage|article|material|document)/i,
  /^which of the following/i,
  /^what is the primary (role|purpose|function) of/i,
  /^how does .{1,60} relate to/i,
  /^what (does|is) .{1,40} (refer to|best described as|known as)\b/i,
  /^why is .{1,40} important/i,
  /^what (can|could) be (inferred|concluded) (from|about)/i,
  /^in the (text|passage|material)[,:]/i,
];

/** Options that make a multiple-choice item unanswerable or trivial. */
const BANNED_OPTIONS: RegExp[] = [
  /\ball of the above\b/i,
  /\bnone of the above\b/i,
  /\bboth [a-c] and [a-c]\b/i,
  /\ball of these\b/i,
];

/** Explanations that say nothing about why the answer is right. */
const BANNED_EXPLANATIONS: RegExp[] = [
  /^(based on|according to) the (provided|given)?\s*(material|text|passage)/i,
  /^(it is )?(stated|mentioned|shown) in the (text|material|passage)/i,
  /^as (stated|mentioned) (in|above)/i,
];

export interface QualityDrop {
  question: string;
  reason: string;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Longest/shortest option length ratio above this means one option gives itself away. */
const MAX_LENGTH_RATIO = 2.2;

/**
 * A shared run of this many characters means two stems ask the same thing.
 *
 * Rewording defeats both an exact match and a prefix match: "Which market
 * structure features a single supplier controlling the entire output…" and
 * "What market structure characterizes an industry featuring a single supplier
 * controlling the entire…" are one question, but they only agree from the
 * middle. Five-odd words of identical wording inside a stem is specific enough
 * to call them the same; a shared topic alone does not reach this length.
 */
const DUPLICATE_PHRASE_CHARS = 32;

/**
 * `stemSeen` holds normalized stems, plus one key per phrase window, prefixed so
 * a window can never be mistaken for a stem. Keeping both in the set the caller
 * already passes means the filters stay independent per generation request.
 */
const PHRASE_KEY = "~";

/**
 * Returns the reason an item fails, or null when it is acceptable.
 * `stemSeen` carries normalized stems within one batch so repeats are caught.
 */
export function qualityIssue(
  q: {
    type?: string;
    question?: string;
    options?: unknown;
    correctAnswer?: string;
    explanation?: string;
  },
  stemSeen?: Set<string>
): string | null {
  const stem = String(q.question || "").trim();
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [];
  const isTF = q.type === "true_false";

  if (stem.length < 20) return "stem too short to be self-contained";
  if (stem.length > 320) return "stem too long";
  for (const re of BANNED_STEMS) {
    if (re.test(stem)) return `banned stem shape: ${re.source}`;
  }
  if (stemSeen) {
    const key = norm(stem);
    if (stemSeen.has(key)) return "duplicate stem";
    // Near-duplicates: the same opening clause usually means the same fact.
    for (const seen of stemSeen) {
      if (seen.startsWith(PHRASE_KEY)) continue;
      if (seen.length > 40 && key.length > 40 && seen.slice(0, 40) === key.slice(0, 40)) {
        return "near-duplicate stem";
      }
    }
    // Reworded duplicates: any identical run anywhere in the two stems.
    if (key.length >= DUPLICATE_PHRASE_CHARS) {
      for (let i = 0; i + DUPLICATE_PHRASE_CHARS <= key.length; i++) {
        if (stemSeen.has(PHRASE_KEY + key.slice(i, i + DUPLICATE_PHRASE_CHARS))) {
          return "repeats an earlier question in other words";
        }
      }
      for (let i = 0; i + DUPLICATE_PHRASE_CHARS <= key.length; i++) {
        stemSeen.add(PHRASE_KEY + key.slice(i, i + DUPLICATE_PHRASE_CHARS));
      }
    }
    stemSeen.add(key);
  }

  const explanation = String(q.explanation || "").trim();
  if (explanation) {
    for (const re of BANNED_EXPLANATIONS) {
      if (re.test(explanation)) return "explanation points at the text instead of reasoning";
    }
  }

  if (isTF) {
    if (options.length !== 2) return "true/false needs exactly two options";
    return null;
  }

  if (q.type === "short_answer" || q.type === "fill_blank") {
    if (!String(q.correctAnswer || "").trim()) return "missing answer";
    return null;
  }

  // multiple choice
  if (options.length !== 4) return `expected 4 options, got ${options.length}`;
  for (const opt of options) {
    if (!opt) return "empty option";
    for (const re of BANNED_OPTIONS) {
      if (re.test(opt)) return `banned option text: ${re.source}`;
    }
    if (norm(opt) === norm(stem)) return "option repeats the stem";
  }
  if (new Set(options.map(norm)).size !== options.length) return "duplicate options";

  const lengths = options.map((o) => o.length).filter((n) => n > 0);
  const longest = Math.max(...lengths);
  const shortest = Math.max(1, Math.min(...lengths));
  // Short answers like "Stroma" vs "Thylakoid lumen" are normal parallel options;
  // only a large absolute spread (a padded, giveaway option) is a defect.
  if (longest - shortest > 18 && longest / shortest > MAX_LENGTH_RATIO) {
    return "options are wildly different lengths";
  }

  return null;
}

/**
 * Split a generated batch into kept items and dropped items with reasons.
 * Returns everything when nothing is wrong, so callers can log only on change.
 */
export function filterLowQuality<T extends {
  type?: string;
  question?: string;
  options?: unknown;
  correctAnswer?: string;
  explanation?: string;
}>(items: T[], stemSeen: Set<string> = new Set<string>()): { kept: T[]; dropped: QualityDrop[] } {
  const kept: T[] = [];
  const dropped: QualityDrop[] = [];

  for (const item of items) {
    const reason = qualityIssue(item, stemSeen);
    if (reason) {
      dropped.push({ question: String(item.question || ""), reason });
    } else {
      kept.push(item);
    }
  }

  return { kept, dropped };
}
