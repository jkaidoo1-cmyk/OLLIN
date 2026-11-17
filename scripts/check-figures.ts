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
import { groupQuestions, printsContext } from "../src/lib/question-groups.ts";
import { analyseItems, flagLabel } from "../src/lib/item-analytics.ts";

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

// ─── Case-study grouping ──────────────────────────────────
const plain = groupQuestions([
  { id: "a", preamble: null },
  { id: "b" },
]);
eq("questions without a preamble form no groups", plain.size, 0);

const caseSet = groupQuestions([
  { id: "a", preamble: "A case about refining." },
  { id: "b", preamble: "A  case   about refining." },
  { id: "c", preamble: "A case about refining." },
  { id: "d", preamble: null },
]);
eq("one case groups its questions", caseSet.size, 3);
eq("group size counts every member", caseSet.get("a")?.size, 3);
eq("only the first question leads", caseSet.get("a")?.leader, true);
eq("later members are not leaders", caseSet.get("c")?.leader, false);
eq("members keep their position", caseSet.get("b")?.index, 1);
eq("a question without context is not grouped", caseSet.get("d"), undefined);

eq(
  "an interrupted case makes two groups",
  groupQuestions([
    { id: "a", preamble: "Same case text here." },
    { id: "b", preamble: null },
    { id: "c", preamble: "Same case text here." },
  ]).get("c")?.size,
  1
);

eq("a lone preamble prints itself", printsContext(undefined), true);
eq("a lone preamble prints itself (size 1)", printsContext({ id: "a", size: 1, index: 0, leader: true }), true);
eq("the leader prints the context", printsContext({ id: "a", size: 2, index: 0, leader: true }), true);
eq("members do not repeat it", printsContext({ id: "a", size: 2, index: 1, leader: false }), false);

// ─── Item analytics ──────────────────────────────────────
const q1 = { id: "q1", correct_answer: "b", figure: { kind: "bar" }, preamble: null };
const q2 = { id: "q2", correct_answer: "x", figure: null, preamble: "A case." };

const allWrong = analyseItems(
  [q1],
  Array.from({ length: 6 }, (_, i) => ({ score_percentage: 0, answers: { q1: "a" }, attempt_answers: [] }))
);
eq("nobody right → flagged as a wrong key", allWrong.items[0].flag, "likely_wrong_key");
eq("success rate counts answers", allWrong.items[0].answered, 6);
eq("nobody right → 0%", allWrong.items[0].pValue, 0);
eq("flagged items are listed", allWrong.suspicious.length, 1);

eq(
  "one wrong answer is not enough to blame the key",
  analyseItems([q1], [{ score_percentage: 0, answers: { q1: "a" } }]).items[0].flag,
  null
);

eq(
  "an unanswered item reports no data",
  analyseItems([q1], []).items[0].flag,
  "no_data"
);
eq(
  "everyone right → too easy",
  analyseItems(
    [q1],
    Array.from({ length: 6 }, () => ({ score_percentage: 100, answers: { q1: "b" } }))
  ).items[0].flag,
  "too_easy"
);

// A crisp item: the top third always right, the bottom third always wrong.
const crisp = [];
for (let i = 0; i < 9; i++) {
  crisp.push({ score_percentage: i < 3 ? 100 : i > 5 ? 0 : 50, answers: { q1: i < 3 ? "b" : "a" } });
}
eq("a crisp item separates the groups", analyseItems([q1], crisp).items[0].discrimination, 1);
eq("a crisp item carries no flag", analyseItems([q1], crisp).items[0].flag, null);

// Half right, but the same half in both groups: measures nothing.
const flat = [];
for (let i = 0; i < 9; i++) {
  const correct = i % 3 === 0;
  flat.push({ score_percentage: 90 - i * 10, answers: { q1: correct ? "b" : "a" } });
}
eq("an item nobody separates on is weak", analyseItems([q1], flat).items[0].flag, "weak");

// Graded arrays win over the raw selections.
eq(
  "graded answers are trusted",
  analyseItems(
    [q1],
    [
      {
        score_percentage: 100,
        answers: { q1: "a" },
        attempt_answers: [{ question_id: "q1", selected_answer: "b", is_correct: true }],
      },
    ]
  ).items[0].correct,
  1
);

const mixed = analyseItems(
  [q1, q2],
  [
    { score_percentage: 50, answers: { q1: "b", q2: "y" } },
    { score_percentage: 50, answers: { q1: "a", q2: "x" } },
  ]
);
eq("figure breakdown separates kinds", mixed.byFigure.length, 2);
eq(
  "figure breakdown keys off the kind",
  mixed.byFigure.find((f) => f.key === "bar")?.answered,
  2
);
eq("plainer questions are bucketed as none", mixed.byFigure.find((f) => f.key === "none")?.answered, 2);
eq("flag labels read plainly", flagLabel("likely_wrong_key"), "check the answer key");

if (failures > 0) {
  console.error(`\n${failures} figure check(s) failed.`);
  process.exit(1);
}
console.log("figure checks passed");
