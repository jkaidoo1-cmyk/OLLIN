"use client";

import { useState } from "react";
import { BarChart3, Trash2 } from "lucide-react";
import { QuestionFigure } from "@/components/QuestionFigure";
import { normalizeFigure, type QuestionFigure as FigureData } from "@/lib/question-figure";

type Kind = FigureData["kind"];

/**
 * Authoring control for a question's figure — a chart or a data table.
 *
 * Generation can attach one, but a teacher writing or fixing a question by hand
 * had no way to see it, change it, or add one, so every generated figure was
 * taken on trust. This edits the same data the model returns and previews it
 * exactly as the participant will see it.
 */
export function FigureEditor({
  figure,
  onChange,
}: {
  figure?: FigureData | null;
  onChange: (figure: FigureData | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(figure?.kind ?? "bar");
  const [labels, setLabels] = useState(figure && figure.kind !== "table" ? figure.labels.join(", ") : "");
  const [values, setValues] = useState(
    figure && figure.kind !== "table" ? figure.values.map(String).join(", ") : ""
  );
  const [csv, setCsv] = useState(figureToCsv(figure));
  const [hint, setHint] = useState("");

  const commit = (next: Partial<FigureData>, raw?: { labels?: string; values?: string }) => {
    const source =
      next.kind === "table" || (!next.kind && kind === "table")
        ? { kind: "table" as Kind, ...parseTable(csv) }
        : {
            kind: next.kind ?? kind,
            ...parseSeries(raw?.labels ?? labels, raw?.values ?? values),
          };
    const normalized = normalizeFigure({ ...source, ...next });
    setHint(normalized ? "" : "Needs 2–12 labels with one number each, in the same order.");
    onChange(normalized);
  };

  const addFigure = () => {
    setOpen(true);
    setHint("");
    setKind("bar");
    setLabels("A, B");
    setValues("0, 0");
    onChange(normalizeFigure({ kind: "bar", labels: ["A", "B"], values: [0, 0] }));
  };

  const remove = () => {
    setOpen(false);
    setHint("");
    setKind("bar");
    setLabels("");
    setValues("");
    setCsv("");
    onChange(null);
  };

  const switchKind = (next: Kind) => {
    setKind(next);
    setHint("");
    if (next === "table") {
      const seed = figure?.kind === "table" ? csv : csv || "Item, Value\nA, 0\nB, 0";
      setCsv(seed);
      onChange(normalizeFigure({ kind: "table", ...parseTable(seed) }));
      return;
    }
    if (figure?.kind === "table") {
      // Coming back from a table: start from its first two columns.
      const nextLabels = (figure.rows ?? []).map((r) => r[0]).join(", ");
      const nextValues = (figure.rows ?? []).map((r) => r[1] ?? "0").join(", ");
      setLabels(nextLabels);
      setValues(nextValues);
      onChange(
        normalizeFigure({ kind: next, labels: split(nextLabels), values: toNumbers(nextValues) })
      );
      return;
    }
    commit({ kind: next });
  };

  if (!figure && !open) {
    return (
      <button
        type="button"
        onClick={addFigure}
        className="inline-flex items-center gap-1.5 text-xs text-[#006633] hover:underline mt-2"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        Add chart or table
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#333]">
          {kind === "table" ? "Data table" : "Chart"}
        </span>
        <button
          type="button"
          onClick={remove}
          className="inline-flex items-center gap-1 text-[11px] text-[#999] hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" /> Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#666]">
          Type
          <select
            value={kind}
            onChange={(e) => switchKind(e.target.value as Kind)}
            className="input-field text-xs h-8 mt-0.5 w-full"
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
            <option value="table">Table</option>
          </select>
        </label>
        <label className="text-[11px] text-[#666]">
          Title
          <input
            type="text"
            value={figure?.title ?? ""}
            onChange={(e) => commit({ title: e.target.value })}
            placeholder="Output by year"
            className="input-field text-xs h-8 mt-0.5 w-full"
          />
        </label>
      </div>

      {kind === "table" ? (
        <label className="block text-[11px] text-[#666]">
          Rows — comma separated, first line is the header
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              const parsed = normalizeFigure({ kind: "table", ...parseTable(e.target.value) });
              setHint(parsed ? "" : "Needs a header row and 1–10 rows of matching width (max 4 columns).");
              onChange(parsed);
            }}
            rows={4}
            placeholder={"Year, Output, Price\n2021, 12, 64\n2022, 19, 41"}
            className="input-field text-xs w-full mt-0.5 resize-y font-mono"
          />
        </label>
      ) : (
        <>
          <label className="block text-[11px] text-[#666]">
            Labels (comma separated)
            <input
              type="text"
              value={labels}
              onChange={(e) => {
                setLabels(e.target.value);
                commit({}, { labels: e.target.value });
              }}
              placeholder="2021, 2022, 2023"
              className="input-field text-xs h-8 mt-0.5 w-full"
            />
          </label>

          <label className="block text-[11px] text-[#666]">
            Values (same order)
            <input
              type="text"
              value={values}
              onChange={(e) => {
                setValues(e.target.value);
                commit({}, { values: e.target.value });
              }}
              placeholder="12, 19, 25"
              className="input-field text-xs h-8 mt-0.5 w-full"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-[#666]">
              X label
              <input
                type="text"
                value={figure?.x_label ?? ""}
                onChange={(e) => commit({ x_label: e.target.value })}
                placeholder="Year"
                className="input-field text-xs h-8 mt-0.5 w-full"
              />
            </label>
            <label className="text-[11px] text-[#666]">
              Y label
              <input
                type="text"
                value={figure?.y_label ?? ""}
                onChange={(e) => commit({ y_label: e.target.value })}
                placeholder="Million tonnes"
                className="input-field text-xs h-8 mt-0.5 w-full"
              />
            </label>
          </div>
        </>
      )}

      {hint && <p className="text-[11px] text-amber-700">{hint}</p>}

      {/* Exactly what the participant sees, updated as the author types. */}
      {figure && <QuestionFigure figure={figure} />}
    </div>
  );
}

const split = (s: string) => s.split(",").map((p) => p.trim()).filter(Boolean);

function toNumbers(s: string): number[] {
  return split(s).map((v) => Number(v.replace(/[^0-9.eE+-]/g, "")));
}

function parseSeries(labels: string, values: string): { labels: string[]; values: number[] } {
  return { labels: split(labels), values: toNumbers(values) };
}

/** "Year, Output\n2021, 12" → { headers: [...], rows: [...] }. */
function parseTable(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const [headers = [], ...rows] = lines.map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

function figureToCsv(figure?: FigureData | null): string {
  if (!figure || figure.kind !== "table") return "";
  return [figure.headers ?? [], ...(figure.rows ?? [])].map((r) => r.join(", ")).join("\n");
}
