"use client";

import { useState } from "react";
import { BarChart3, Trash2 } from "lucide-react";
import { QuestionFigure } from "@/components/QuestionFigure";
import { normalizeFigure, type QuestionFigure as FigureData } from "@/lib/question-figure";

/**
 * Authoring control for a question's chart.
 *
 * Generation can attach a figure, but a teacher writing or fixing a question by
 * hand had no way to see it, change it, or add one — so every AI figure was
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
  const [labels, setLabels] = useState(figure?.labels.join(", ") ?? "");
  const [values, setValues] = useState(figure?.values.join(", ") ?? "");
  const [hint, setHint] = useState("");

  // `raw` carries the field being edited: state updates are async, so reading
  // it back from state inside the same handler would lag one keystroke.
  const commit = (next: Partial<FigureData>, raw?: { labels?: string; values?: string }) => {
    const merged = {
      kind: figure?.kind ?? "bar",
      ...next,
      ...parseSeries(raw?.labels ?? labels, raw?.values ?? values),
    };
    const normalized = normalizeFigure(merged);
    setHint(normalized ? "" : "Chart needs 2–12 labels with one number each, in the same order.");
    onChange(normalized);
  };

  const addFigure = () => {
    setOpen(true);
    setHint("");
    // Seed with an empty two-point series so the first edit has something to
    // work with instead of an empty canvas.
    setLabels(labels || "A, B");
    setValues(values || "0, 0");
    onChange(normalizeFigure({ kind: "bar", labels: ["A", "B"], values: [0, 0] }));
  };

  const remove = () => {
    setOpen(false);
    setHint("");
    setLabels("");
    setValues("");
    onChange(null);
  };

  if (!figure && !open) {
    return (
      <button
        type="button"
        onClick={addFigure}
        className="inline-flex items-center gap-1.5 text-xs text-[#006633] hover:underline mt-2"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        Add chart
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#333]">Chart</span>
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
            value={figure?.kind ?? "bar"}
            onChange={(e) => commit({ kind: e.target.value as FigureData["kind"] })}
            className="input-field text-xs h-8 mt-0.5 w-full"
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
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

      {hint && <p className="text-[11px] text-amber-700">{hint}</p>}

      {/* Exactly what the participant sees, updated as the author types. */}
      {figure && <QuestionFigure figure={figure} />}
    </div>
  );
}

/** Parse two comma-separated fields into a chart series. */
function parseSeries(labels: string, values: string): { labels: string[]; values: number[] } {
  const split = (s: string) => s.split(",").map((p) => p.trim()).filter(Boolean);
  return {
    labels: split(labels),
    values: split(values).map((v) => Number(v.replace(/[^0-9.eE+-]/g, ""))),
  };
}
