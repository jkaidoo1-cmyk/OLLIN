/**
 * Figures attached to a question.
 *
 * Many questions are unanswerable without the data they refer to ("according to
 * the chart…", "which year had the highest…"). Rather than ask an image model
 * to paint a chart — which routinely mislabels axes and invents values — the
 * model returns the data itself and the app draws it as SVG: exact, crisp at
 * any size, printable, tiny to store, and free to render.
 */
export interface QuestionFigure {
  /**
   * `table` is not a chart: it renders the headers/rows as a real table, which
   * is how most exam questions present lookups and multi-column data.
   */
  kind: "bar" | "line" | "pie" | "table";
  title?: string;
  x_label?: string;
  y_label?: string;
  labels: string[];
  values: number[];
  /** Table only: column headings (2–4) and rows of the same width. */
  headers?: string[];
  rows?: string[][];
  caption?: string;
}

const MAX_POINTS = 12;
const MAX_LABEL = 24;
const MAX_TITLE = 90;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Validate a figure that came from a model or a stored row. Anything that is
 * not a usable chart returns null — a half-valid figure would render a wrong
 * picture, which is worse than no picture at all.
 */
export function normalizeFigure(raw: unknown): QuestionFigure | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  const kind = String(input.kind ?? "").toLowerCase();
  if (kind === "table") {
    const headers = Array.isArray(input.headers)
      ? input.headers.map((h) => text(h, MAX_LABEL))
      : [];
    const rows = Array.isArray(input.rows)
      ? input.rows.map((row) =>
          Array.isArray(row) ? row.map((cell) => text(cell, MAX_LABEL)) : []
        )
      : [];
    if (headers.length < 2 || headers.length > 4) return null;
    if (rows.length < 1 || rows.length > 10) return null;
    // A ragged table can't be drawn honestly; reject instead of padding blanks.
    if (rows.some((r) => r.length !== headers.length || r.some((c) => !c))) return null;
    return {
      kind: "table",
      title: text(input.title, MAX_TITLE) || undefined,
      headers,
      rows,
      labels: [],
      values: [],
      caption: text(input.caption, MAX_TITLE) || undefined,
    };
  }
  if (kind !== "bar" && kind !== "line" && kind !== "pie") return null;

  const labels = Array.isArray(input.labels)
    ? input.labels.map((l) => text(l, MAX_LABEL))
    : [];
  const values = Array.isArray(input.values)
    ? input.values.map((v) => (typeof v === "number" ? v : Number(String(v ?? "").trim())))
    : [];

  if (labels.length < 2 || labels.length !== values.length) return null;
  if (labels.length > MAX_POINTS) return null;
  if (labels.some((l) => !l)) return null;
  if (values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e9)) return null;
  // A pie can't show negative slices; refuse rather than silently drop data.
  if (kind === "pie" && values.some((v) => v < 0)) return null;
  // A flat series draws nothing meaningful in a pie.
  if (kind === "pie" && values.reduce((s, v) => s + v, 0) <= 0) return null;

  return {
    kind,
    title: text(input.title, MAX_TITLE) || undefined,
    x_label: text(input.x_label ?? input.xlabel, MAX_LABEL) || undefined,
    y_label: text(input.y_label ?? input.ylabel, MAX_LABEL) || undefined,
    labels,
    values,
    caption: text(input.caption, MAX_TITLE) || undefined,
  };
}

const MAX_PREAMBLE = 1200;

/**
 * Optional shared context printed above a question: a case, a short passage, a
 * scenario the question refers to. Whitespace is collapsed (models love
 * double-spaced output) and an empty string means "no preamble", not "blank".
 */
export function normalizePreamble(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (text.length < 10) return null;
  return text.slice(0, MAX_PREAMBLE);
}

/**
 * True when an error is the database rejecting one of the optional question
 * columns (`figure`, `preamble`) that hasn't been migrated in yet. Callers retry
 * the save without them so a missing migration never costs a quiz.
 */
export function isMissingOptionalColumn(error: unknown): boolean {
  const message = String(
    (error as { message?: string })?.message ?? error ?? ""
  );
  return /(figure|preamble)/i.test(message) && /(column|schema|does not exist)/i.test(message);
}
