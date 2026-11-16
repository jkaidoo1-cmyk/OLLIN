"use client";

import { normalizeFigure, type QuestionFigure as FigureData } from "@/lib/question-figure";

/**
 * Draws a question's data figure as SVG.
 *
 * SVG keeps axis labels sharp at any size and in print, needs no network
 * request, and can't drift from the numbers it was generated from.
 */
export function QuestionFigure({ figure }: { figure?: FigureData | null }) {
  const fig = normalizeFigure(figure);
  if (!fig) return null;

  return (
    <figure className="my-3 rounded-lg border border-[#e6e6e6] bg-white p-3">
      {fig.title && (
        <figcaption className="text-xs font-semibold text-[#333] mb-2 text-center">
          {fig.title}
        </figcaption>
      )}
      {fig.kind === "pie" ? <Pie fig={fig} /> : fig.kind === "line" ? <Line fig={fig} /> : <Bar fig={fig} />}
      {/* The numbers stay reachable without reading the picture: screen readers
          and anyone on a tiny screen get the data, not just a shape. */}
      <details className="mt-2">
        <summary className="text-[10px] text-[#888] cursor-pointer select-none">Show data</summary>
        <table className="w-full mt-1 text-[10px] text-[#555]">
          <tbody>
            {fig.labels.map((label, i) => (
              <tr key={i} className="border-t border-[#f0f0f0]">
                <th scope="row" className="text-left font-normal py-0.5 pr-2">{label}</th>
                <td className="text-right py-0.5">{fig.values[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {(fig.x_label || fig.y_label) && (
        <p className="text-[10px] text-[#888] text-center mt-1">
          {[fig.x_label, fig.y_label].filter(Boolean).join(" · ")}
        </p>
      )}
      {fig.caption && <p className="text-[10px] text-[#888] mt-1">{fig.caption}</p>}
    </figure>
  );
}

const W = 360;
const H = 210;
const PAD = { top: 12, right: 10, bottom: 34, left: 40 };

/** One sentence of the chart's data, for assistive tech. */
function describe(fig: FigureData): string {
  const points = fig.labels.map((l, i) => `${l} ${fig.values[i]}`).join(", ");
  return `${fig.kind} chart${fig.title ? `, ${fig.title}` : ""}: ${points}.`;
}

const COLORS = [
  "#0d6b3d", "#12854e", "#1a9b5f", "#3fb37c",
  "#6cc79b", "#95d6b6", "#b9e4cf", "#0a5c34",
];

function ticks(min: number, max: number): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / 4))) || 1;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out.slice(0, 6);
}

function Axes({
  min,
  max,
  yLabel,
  xLabel,
}: {
  min: number;
  max: number;
  yLabel?: string;
  xLabel?: string;
}) {
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min || 1)) * plotH;
  return (
    <g>
      {ticks(min, max).map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={y(t)}
            y2={y(t)}
            stroke="#eee"
            strokeWidth={1}
          />
          <text x={PAD.left - 5} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#888">
            {t}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={PAD.left + plotW}
        y1={y(Math.max(0, min))}
        y2={y(Math.max(0, min))}
        stroke="#bbb"
        strokeWidth={1}
      />
      {yLabel && (
        <text
          x={10}
          y={PAD.top + plotH / 2}
          fontSize={8}
          fill="#888"
          textAnchor="middle"
          transform={`rotate(-90 10 ${PAD.top + plotH / 2})`}
        >
          {yLabel}
        </text>
      )}
      {xLabel && (
        <text x={PAD.left + plotW / 2} y={H - 2} fontSize={8} fill="#888" textAnchor="middle">
          {xLabel}
        </text>
      )}
    </g>
  );
}

function Bar({ fig }: { fig: FigureData }) {
  const min = Math.min(0, ...fig.values);
  const max = Math.max(0, ...fig.values);
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min || 1)) * plotH;
  const slot = plotW / fig.values.length;
  const barW = Math.min(34, slot * 0.62);
  const base = y(Math.max(0, min));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fig.title || "Bar chart"} className="w-full h-auto">
      <title>{fig.title || "Bar chart"}</title>
      <desc>{describe(fig)}</desc>
      <Axes min={min} max={max} yLabel={fig.y_label} xLabel={fig.x_label} />
      {fig.values.map((v, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        const top = Math.min(y(v), base);
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.abs(base - y(v))}
              rx={2}
              fill={COLORS[i % COLORS.length]}
            />
            <text x={cx} y={H - PAD.bottom + 12} fontSize={9} fill="#666" textAnchor="middle">
              {fig.labels[i]}
            </text>
            <text x={cx} y={top - 3} fontSize={8} fill="#555" textAnchor="middle">
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Line({ fig }: { fig: FigureData }) {
  const min = Math.min(0, ...fig.values);
  const max = Math.max(0, ...fig.values);
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min || 1)) * plotH;
  const x = (i: number) =>
    fig.values.length === 1 ? PAD.left : PAD.left + (plotW * i) / (fig.values.length - 1);
  const points = fig.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fig.title || "Line chart"} className="w-full h-auto">
      <title>{fig.title || "Line chart"}</title>
      <desc>{describe(fig)}</desc>
      <Axes min={min} max={max} yLabel={fig.y_label} xLabel={fig.x_label} />
      <polyline points={points} fill="none" stroke={COLORS[0]} strokeWidth={2} strokeLinejoin="round" />
      {fig.values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={3} fill={COLORS[0]} />
          <text
            x={x(i)}
            y={H - PAD.bottom + 12}
            fontSize={9}
            fill="#666"
            textAnchor={i === 0 ? "start" : i === fig.values.length - 1 ? "end" : "middle"}
          >
            {fig.labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Pie({ fig }: { fig: FigureData }) {
  const total = fig.values.reduce((s, v) => s + v, 0) || 1;
  const cx = 105;
  const cy = H / 2;
  const r = 72;
  const angle = -Math.PI / 2;

  // Start angle of each slice, accumulated up front so the render stays pure.
  const starts = fig.values.reduce<number[]>((acc, _v, i) => {
    acc.push(i === 0 ? angle : acc[i - 1] + (fig.values[i - 1] / total) * Math.PI * 2);
    return acc;
  }, []);

  const arcs = fig.values.map((v, i) => {
    const start = starts[i];
    const sweep = (v / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(start + sweep);
    const y2 = cy + r * Math.sin(start + sweep);
    // A whole-circle slice needs two half arcs; a single arc path is invalid.
    const d =
      v >= total
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    return <path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={1} />;
  });

  const legendX = 200;
  const rowH = 18;
  const legendTop = Math.max(18, cy - (fig.values.length * rowH) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fig.title || "Pie chart"} className="w-full h-auto">
      <title>{fig.title || "Pie chart"}</title>
      <desc>{describe(fig)}</desc>
      {arcs}
      {fig.labels.map((label, i) => {
        const pct = Math.round((fig.values[i] / total) * 100);
        return (
          <g key={i}>
            <rect x={legendX} y={legendTop + i * rowH - 7} width={8} height={8} rx={1} fill={COLORS[i % COLORS.length]} />
            <text x={legendX + 12} y={legendTop + i * rowH} fontSize={9} fill="#555">
              {label} — {pct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
