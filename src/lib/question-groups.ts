/**
 * Case-study grouping for a quiz's questions.
 *
 * A case that spans several questions stores the same preamble on each of them,
 * because every question must be able to stand alone (questions can be shown in
 * any order). When they *are* shown in order, repeating the passage on every
 * card is noise — so consecutive questions sharing an identical preamble are
 * presented as one group, printed once.
 *
 * Pure and dependency-free so the rule can be checked directly.
 */

export interface QuestionGroupInfo {
  /** Stable key for the run: the id of its first question. */
  id: string;
  /** How many questions share this context. */
  size: number;
  /** Position within the run, 0-based. */
  index: number;
  /** True for the question that carries the printed passage. */
  leader: boolean;
}

type WithPreamble = { id: string; preamble?: string | null };

const key = (q: WithPreamble): string => (q.preamble ?? "").replace(/\s+/g, " ").trim();

/**
 * Map each question id to its group. Questions without a preamble are absent
 * from the map, and a "group" of one is reported with size 1 so callers can
 * keep rendering it inline.
 */
export function groupQuestions<T extends WithPreamble>(
  questions: T[]
): Map<string, QuestionGroupInfo> {
  const groups = new Map<string, QuestionGroupInfo>();
  let i = 0;
  while (i < questions.length) {
    const preamble = key(questions[i]);
    if (!preamble) {
      i++;
      continue;
    }
    // Extend the run while the same context repeats on consecutive questions.
    let end = i + 1;
    while (end < questions.length && key(questions[end]) === preamble) end++;
    const size = end - i;
    for (let j = i; j < end; j++) {
      groups.set(questions[j].id, {
        id: questions[i].id,
        size,
        index: j - i,
        leader: j === i,
      });
    }
    i = end;
  }
  return groups;
}

/** True when this question should print the shared context itself. */
export function printsContext(info: QuestionGroupInfo | undefined): boolean {
  return !info || info.size === 1 || info.leader;
}
