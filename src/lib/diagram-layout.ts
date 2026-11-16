import type { DiagramEdge, DiagramNode } from "./question-figure";

/**
 * Layout for block diagrams (signal chains, control loops, process flows).
 *
 * Kept free of React so it can be tested directly: the cycle handling and the
 * column/row placement are where a diagram goes wrong, not the SVG markup.
 */

export const BOX_W = 118;
export const BOX_H = 46;
export const COL_GAP = 46;
export const ROW_GAP = 16;
export const PAD = 12;
export const FEEDBACK_LANE = 26;

export interface DiagramLayout {
  place: Map<string, { x: number; y: number }>;
  /** Indices of edges that close a cycle — drawn as a feedback lane. */
  back: Set<number>;
  width: number;
  height: number;
}

export function layoutGraph(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramLayout {
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<number>();

  // Depth-first first: an edge into a node still on the stack closes a loop.
  // Marking those before layering stops a control loop from pushing its own
  // boxes into an endless row.
  const visit = (id: string) => {
    state.set(id, 1);
    edges.forEach((e, i) => {
      if (e.from !== id) return;
      const s = state.get(e.to) ?? 0;
      if (s === 1) back.add(i);
      else if (s === 0) visit(e.to);
    });
    state.set(id, 2);
  };
  nodes.forEach((n) => {
    if ((state.get(n.id) ?? 0) === 0) visit(n.id);
  });

  // Longest-path layering over the acyclic remainder.
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    edges.forEach((e, i) => {
      if (back.has(i)) return;
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const columns = new Map<number, string[]>();
  nodes.forEach((n) => {
    const col = layer.get(n.id) ?? 0;
    columns.set(col, [...(columns.get(col) ?? []), n.id]);
  });

  const maxCol = Math.max(0, ...columns.keys());
  const maxRows = Math.max(1, ...[...columns.values()].map((c) => c.length));

  const place = new Map<string, { x: number; y: number }>();
  for (const [col, ids] of columns) {
    // A short column is centred against the tallest one.
    const offset = ((maxRows - ids.length) * (BOX_H + ROW_GAP)) / 2;
    ids.forEach((id, row) => {
      place.set(id, {
        x: PAD + col * (BOX_W + COL_GAP),
        y: PAD + offset + row * (BOX_H + ROW_GAP),
      });
    });
  }

  return {
    place,
    back,
    width: PAD * 2 + (maxCol + 1) * BOX_W + maxCol * COL_GAP,
    height: PAD * 2 + maxRows * BOX_H + (maxRows - 1) * ROW_GAP + (back.size ? FEEDBACK_LANE : 0),
  };
}
