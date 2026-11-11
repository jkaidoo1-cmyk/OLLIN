/**
 * Shared answer comparison used by every grader (submit, autosave, data.ts).
 *
 * A multiple-choice answer is stored as the option's zero-based index
 * ("0".."3"), but older rows and extracted material can hold the option's text
 * instead. Both forms must compare equal — and autosave must agree with the
 * final submission, or a question can be "correct" while answering and
 * "wrong" once graded.
 */

export const loose = (v: string): string =>
  String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function isAnswerCorrect(
  selected: string,
  correct: string,
  options: string[]
): boolean {
  const sel = String(selected ?? "").trim().toLowerCase();
  const cor = String(correct ?? "").trim().toLowerCase();
  if (sel === cor) return true;
  if (!sel) return false;

  const opts = (options || []).map((o) => String(o ?? ""));
  const isIndex = (v: string) => /^\d+$/.test(v);

  // True/false stored without options: index 0 is True, 1 is False.
  if (opts.length === 0) {
    const toBool = (v: string) =>
      /^(true|false)$/.test(v)
        ? v
        : isIndex(v)
        ? Number(v) === 0
          ? "true"
          : "false"
        : "";
    const a = toBool(sel);
    const b = toBool(cor);
    return !!a && a === b;
  }

  const at = (v: string) =>
    isIndex(v) && Number(v) < opts.length ? opts[Number(v)] : undefined;

  // One side is an index, the other the option's text.
  const selectedText = at(sel);
  if (selectedText && loose(selectedText) === loose(cor)) return true;

  const correctText = at(cor);
  if (correctText && loose(correctText) === loose(sel)) return true;

  return false;
}
