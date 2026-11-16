"use client";

import { useState } from "react";
import { BarChart3, Trash2 } from "lucide-react";
import { QuestionFigure } from "@/components/QuestionFigure";
import { normalizeFigure, type QuestionFigure as FigureData } from "@/lib/question-figure";

type Kind = FigureData["kind"];

/**
 * Authoring control for a question's figure: a chart, a data table, or a block
 * diagram (signal chains, control loops, process flows).
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
  const [labels, setLabels] = useState(
    figure && (figure.kind === "bar" || figure.kind === "line" || figure.kind === "pie")
      ? figure.labels.join(", ")
      : ""
  );
  const [values, setValues] = useState(
    figure && (figure.kind === "bar" || figure.kind === "line" || figure.kind === "pie")
      ? figure.values.map(String).join(", ")
      : ""
  );
  const [csv, setCsv] = useState(figureToCsv(figure));
  const [wiring, setWiring] = useState(diagramToText(figure));
  const [hint, setHint] = useState("");

  const commit = (next: Partial<FigureData>, raw?: { labels?: string; values?: string }) => {
    const activeKind = next.kind ?? kind;
    const source =
      activeKind === "table"
        ? { kind: "table" as Kind, ...parseTable(csv) }
        : activeKind === "diagram"
          ? { kind: "diagram" as Kind, ...parseDiagram(wiring) }
          : {
              kind: activeKind,
              ...parseSeries(raw?.labels ?? labels, raw?.values ?? values),
            };
    const normalized = normalizeFigure({ ...source, ...next });
    if (!normalized) {
      setHint(
        activeKind === "table"
          ? "Needs a header row and 1–10 rows of matching width (max 4 columns)."
          : activeKind === "diagram"
            ? "Needs at least two blocks joined by arrows, e.g. SENSOR -> PROCESSOR -> METER."
            : "Needs 2–12 labels with one number each, in the same order."
      );
    } else {
      setHint("");
    }
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
    setWiring("");
    onChange(null);
  };

  const switchKind = (next: Kind) => {
    setKind(next);
    setHint("");
    if (next === "table") {
      const seed = figure?.kind === "table" ? csv : "Item, Value\nA, 0\nB, 0";
      setCsv(seed);
      onChange(normalizeFigure({ kind: "table", ...parseTable(seed) }));
      return;
    }
    if (next === "diagram") {
      const seed = figure?.kind === "diagram" ? wiring : "SENSOR -> PROCESSOR -> METER";
      setWiring(seed);
      onChange(normalizeFigure({ kind: "diagram", ...parseDiagram(seed) }));
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
    if (figure?.kind === "diagram") {
      // Coming back from a diagram: a chain cannot become a chart, so start
      // from the block labels as empty categories.
      const ids = (figure.nodes ?? []).map((n) => n.label).slice(0, 8).join(", ");
      setLabels(ids);
      setValues((figure.nodes ?? []).slice(0, 8).map(() => "0").join(", "));
      onChange(
        normalizeFigure({
          kind: next,
          labels: split(ids),
          values: (figure.nodes ?? []).slice(0, 8).map(() => 0),
        })
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
        Add chart, table or diagram
      </button>
    );
  }

  const title = kind === "table" ? "Data table" : kind === "diagram" ? "Diagram" : "Chart";

  return (
    <div className="mt-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#333]">{title}</span>
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
            <option value="diagram">Diagram</option>
          </select>
        </label>
        <label className="text-[11px] text-[#666]">
          Title
          <input
            type="text"
            value={figure?.title ?? ""}
            onChange={(e) => commit({ title: e.target.value })}
            placeholder="Measurement chain"
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
      ) : kind === "diagram" ? (
        <label className="block text-[11px] text-[#666]">
          Blocks — <span className="font-mono">-&gt;</span> joins them, <span className="font-mono">|</span> adds a
          value under the label. One line per chain.
          <textarea
            value={wiring}
            onChange={(e) => {
              setWiring(e.target.value);
              const parsed = normalizeFigure({ kind: "diagram", ...parseDiagram(e.target.value) });
              setHint(parsed ? "" : "Needs at least two blocks joined by arrows.");
              onChange(parsed);
            }}
            rows={4}
            placeholder={"SENSOR | 5 mV/°C ±1% -> PROCESSOR | gain 15 ±0.25 -> METER | 0–2 V, 1.5% FS"}
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

/**
 * "SENSOR | 5 mV/°C -> PROCESSOR | gain 15 -> METER" → nodes + edges.
 * Each line is one chain; several lines allow branches and feedback.
 */
function parseDiagram(raw: string): {
  nodes: { id: string; label: string; detail?: string }[];
  edges: { from: string; to: string }[];
} {
  const nodes = new Map<string, { id: string; label: string; detail?: string }>();
  const edges: { from: string; to: string }[] = [];

  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split("->").map((p) => p.trim()).filter(Boolean);
    const ids: string[] = [];
    for (const part of parts) {
      const [labelRaw, detailRaw] = part.split("|").map((s) => s.trim());
      if (!labelRaw) continue;
      if (!nodes.has(labelRaw)) {
        nodes.set(labelRaw, { id: labelRaw, label: labelRaw, detail: detailRaw || undefined });
      }
      ids.push(labelRaw);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      if (ids[i] !== ids[i + 1]) edges.push({ from: ids[i], to: ids[i + 1] });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/** Diagram → the chains the author edits, joining single-in/single-out runs. */
function diagramToText(figure?: FigureData | null): string {
  if (!figure || figure.kind !== "diagram") return "";
  const nodes = figure.nodes ?? [];
  const edges = figure.edges ?? [];
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  edges.forEach((e) => {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    inn.set(e.to, [...(inn.get(e.to) ?? []), e.from]);
  });
  const detail = new Map(nodes.map((n) => [n.id, n.detail]));
  const used = new Set<string>();
  const label = (id: string) => (detail.get(id) ? `${id} | ${detail.get(id)}` : id);

  const lines: string[] = [];
  const starts = nodes.filter((n) => (inn.get(n.id) ?? []).length === 0).map((n) => n.id);
  const chainFrom = (start: string) => {
    const parts = [start];
    used.add(start);
    let current = start;
    for (;;) {
      const nexts = out.get(current) ?? [];
      if (nexts.length !== 1) break;
      const next = nexts[0];
      if ((inn.get(next) ?? []).length !== 1 || used.has(next)) break;
      parts.push(next);
      used.add(next);
      current = next;
    }
    return parts.map(label).join(" -> ");
  };

  starts.forEach((s) => lines.push(chainFrom(s)));
  // Anything left is a cycle (a control loop): keep its arrows explicit.
  edges.forEach((e) => {
    const line = `${label(e.from)} -> ${label(e.to)}`;
    if (!lines.includes(line)) lines.push(line);
  });
  return [...new Set(lines)].join("\n");
}

function figureToCsv(figure?: FigureData | null): string {
  if (!figure || figure.kind !== "table") return "";
  return [figure.headers ?? [], ...(figure.rows ?? [])].map((r) => r.join(", ")).join("\n");
}
