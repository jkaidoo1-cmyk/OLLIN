/**
 * Sanity checks for question figures: validation and diagram layout.
 *
 * Run with `npm run check:figures`. These cover the parts that fail silently —
 * a figure that validates when it shouldn't draws a wrong picture, and a bad
 * layout puts boxes on top of each other — without needing a browser.
 *
 * Node strips the TypeScript types natively, so there is no test framework and
 * no extra dependency here.
 */
import { normalizeFigure, normalizePreamble } from "../src/lib/question-figure.ts";
import { layoutGraph, BOX_W, BOX_H, COL_GAP, PAD } from "../src/lib/diagram-layout.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) return;
  failures++;
  console.error(`FAIL  ${name}${detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`, actual === expected);
}

// ─── Chart validation ─────────────────────────────────────
const bar = normalizeFigure({ kind: "bar", labels: ["A", "B"], values: [3, 7] });
check("bar accepts a valid series", bar !== null);
eq("bar keeps its values", JSON.stringify(bar && bar.values), "[3,7]");

eq("bar rejects mismatched counts", normalizeFigure({ kind: "bar", labels: ["A", "B"], values: [1] }), null);
eq("bar rejects a single point", normalizeFigure({ kind: "bar", labels: ["A"], values: [1] }), null);
eq(
  "bar rejects more than 12 points",
  normalizeFigure({
    kind: "bar",
    labels: Array.from({ length: 13 }, (_, i) => `P${i}`),
    values: Array(13).fill(1),
  }),
  null
);
eq("bar rejects non-numeric values", normalizeFigure({ kind: "bar", labels: ["A", "B"], values: ["x", 2] }), null);
eq("pie rejects negatives", normalizeFigure({ kind: "pie", labels: ["A", "B"], values: [-1, 2] }), null);
eq("pie rejects a zero total", normalizeFigure({ kind: "pie", labels: ["A", "B"], values: [0, 0] }), null);

// ─── Table validation ─────────────────────────────────────
const table = normalizeFigure({
  kind: "table",
  headers: ["Year", "Output"],
  rows: [
    ["2021", "12"],
    ["2022", "19"],
  ],
});
check("table accepts headers and rows", table !== null);
eq("table keeps row count", table?.rows?.length, 2);

eq(
  "table rejects a ragged row",
  normalizeFigure({ kind: "table", headers: ["A", "B", "C"], rows: [["1", "2"]] }),
  null
);
eq("table rejects one column", normalizeFigure({ kind: "table", headers: ["A"], rows: [["1"]] }), null);
eq("table rejects no rows", normalizeFigure({ kind: "table", headers: ["A", "B"], rows: [] }), null);

// ─── Diagram validation ───────────────────────────────────
const chain = normalizeFigure({
  kind: "diagram",
  nodes: [
    { id: "S", label: "SENSOR", detail: "5 mV/C" },
    { id: "P", label: "PROCESSOR" },
    { id: "M", label: "METER" },
  ],
  edges: [
    { from: "S", to: "P" },
    { from: "P", to: "M" },
  ],
});
check("diagram accepts a chain", chain !== null);
eq("diagram keeps its blocks", chain?.nodes?.length, 3);
eq("diagram keeps its arrows", chain?.edges?.length, 2);
eq(
  "diagram drops an arrow to a missing block",
  // The dangling arrow is the only edge, so nothing usable is left.
  normalizeFigure({
    kind: "diagram",
    nodes: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    edges: [{ from: "A", to: "GHOST" }],
  }),
  null
);
eq(
  "diagram rejects a self-loop",
  normalizeFigure({
    kind: "diagram",
    nodes: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    edges: [{ from: "A", to: "A" }],
  }),
  null
);
eq(
  "diagram rejects a single block",
  normalizeFigure({ kind: "diagram", nodes: [{ id: "A", label: "A" }], edges: [] }),
  null
);

// ─── Preamble ─────────────────────────────────────────────
eq("preamble rejects a fragment", normalizePreamble("too short"), null);
eq("preamble rejects non-strings", normalizePreamble(42), null);
eq(
  "preamble collapses whitespace",
  normalizePreamble("A case  with\tspaces and enough length to count."),
  "A case with spaces and enough length to count."
);
eq("preamble caps its length", normalizePreamble("x".repeat(5000))?.length, 1200);

// ─── Layout: a straight chain ─────────────────────────────
const straight = layoutGraph(
  [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
  ],
  [
    { from: "A", to: "B" },
    { from: "B", to: "C" },
  ]
);
eq("chain has no feedback", straight.back.size, 0);
eq("chain puts A in column 0", straight.place.get("A")?.x, PAD);
eq("chain steps one column per block", straight.place.get("B")?.x, PAD + BOX_W + COL_GAP);
eq("chain width covers three columns", straight.width, PAD * 2 + 3 * BOX_W + 2 * COL_GAP);
eq("chain height holds one row", straight.height, PAD * 2 + BOX_H);

// ─── Layout: a control loop closes with feedback ──────────
const loopIds = ["PROCESS", "TEMP", "TRANSMITTER", "CONTROLLER", "VALVE"];
const loop = layoutGraph(
  loopIds.map((id) => ({ id, label: id })),
  [
    { from: "PROCESS", to: "TEMP" },
    { from: "TEMP", to: "TRANSMITTER" },
    { from: "TRANSMITTER", to: "CONTROLLER" },
    { from: "CONTROLLER", to: "VALVE" },
    { from: "VALVE", to: "PROCESS" },
  ]
);
eq("loop marks exactly one edge as feedback", loop.back.size, 1);
eq("loop marks the closing edge", loop.back.has(4), true);
eq("loop keeps five columns", loop.width, PAD * 2 + 5 * BOX_W + 4 * COL_GAP);
eq("loop reserves the feedback lane", loop.height, PAD * 2 + BOX_H + 26);

// ─── Layout: a branch stacks its rows ─────────────────────
const branch = layoutGraph(
  [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
  ],
  [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
  ]
);
eq("branch puts both targets in column 1", branch.place.get("B")?.x, branch.place.get("C")?.x);
check("branch stacks targets vertically", (branch.place.get("C")?.y ?? 0) > (branch.place.get("B")?.y ?? 0));
check("branch centres the shorter column", (branch.place.get("A")?.y ?? 0) > (branch.place.get("B")?.y ?? 0));
eq("branch height holds two rows", branch.height, PAD * 2 + 2 * BOX_H + 16);

if (failures > 0) {
  console.error(`\n${failures} figure check(s) failed.`);
  process.exit(1);
}
console.log("figure checks passed");
