import type { RichText } from "@decktrail/ir";
import { escapeHtml } from "./html.js";

/**
 * Draw a flowchart as SVG with computed geometry.
 *
 * The first version laid nodes out with flexbox and drew the arrows as CSS borders. It could only
 * connect a node to the one beside it, so the three connections that carry the meaning were the
 * three it could not draw: the turn from the end of one row into the start of the next, the drop
 * out of a decision into the branch it rejects, and a loop. Those became, respectively, nothing at
 * all, a line of text underneath, and a badge. A reader could not follow the flow.
 *
 * The hand-built decks draw theirs as SVG with every coordinate placed by hand. That is not
 * repeatable, but the geometry behind it is: lay the nodes on a serpentine grid and every
 * connection becomes a line between two known boxes. This computes that grid and draws them.
 *
 * It is still one algorithm meeting a graph it has never seen, and it will not beat a diagram
 * somebody drew. It should be able to draw the same picture.
 */

const W = 1040; // viewBox width. Height is computed from the rows.
const NH = 54; // node height
const GAP_X = 30; // between nodes in a row
const GAP_Y = 58; // between rows, which is where the turn arrow goes
const BRANCH_H = 74; // extra band under a row that a branch leaves from
const PAD = 2; // keeps the stroke off the viewBox edge
const MAX_PER_ROW = 5;

export interface FlowNode {
  id: string;
  label: RichText;
}
export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

/** Flatten rich text to the plain string an SVG text node can carry. */
function plain(rt: RichText): string {
  return typeof rt === "string" ? rt : rt.map((r) => ("text" in r ? r.text : "")).join("");
}

/** Break a label to fit its box, at most two lines. Longer than that and the box is wrong. */
function wrap(text: string, width: number, fontSize: number): string[] {
  const perLine = Math.max(6, Math.floor(width / (fontSize * 0.56)));
  if (text.length <= perLine) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > perLine) {
      lines.push(line);
      line = w;
      if (lines.length === 2) break;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (lines.length < 2 && line) lines.push(line);
  // Anything that still does not fit is cut rather than allowed to run out of its box.
  return lines.slice(0, 2).map((l, i, a) => (i === a.length - 1 && text.length > perLine * 2 ? l.replace(/\s+\S*$/, "") + "…" : l));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The spine, the branches and the loops of a graph.
 *
 * The spine is the path a reader follows: start at the node nothing points to, then at every fork
 * take the edge with the most flow left after it. What is left over is a branch. An edge from a
 * node to itself is a loop, which is a property of that node rather than a step to anywhere.
 *
 * The longest continuation, not the first edge, because the first edge is as likely to be the
 * rejection as the main path: a "crawler?" node whose "yes" leads to a 403 and whose "no" leads to
 * the whole rest of the product would otherwise put the 403 on the spine and stack everything else
 * underneath it as branches. The main path is the one with the most road ahead of it, and a dead
 * end is a dead end however it is labelled.
 */
export function walkFlow(nodes: FlowNode[], edges: FlowEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const loops = new Map<string, string | undefined>();
  const real: FlowEdge[] = [];
  for (const e of edges) {
    if (e.from === e.to) loops.set(e.from, e.label);
    else real.push(e);
  }

  const out = new Map<string, FlowEdge[]>();
  for (const e of real) out.set(e.from, [...(out.get(e.from) ?? []), e]);
  const targeted = new Set(real.map((e) => e.to));
  const start = nodes.find((n) => !targeted.has(n.id)) ?? nodes[0];

  /** How many nodes remain on the longest path out of `id`. Memoised; a cycle counts as its end. */
  const depth = new Map<string, number>();
  const reach = (id: string, path: Set<string>): number => {
    const hit = depth.get(id);
    if (hit !== undefined) return hit;
    if (path.has(id)) return 0;
    path.add(id);
    let best = 0;
    for (const e of out.get(id) ?? []) best = Math.max(best, 1 + reach(e.to, path));
    path.delete(id);
    depth.set(id, best);
    return best;
  };

  const spine: string[] = [];
  const spineEdges = new Map<string, FlowEdge>();
  const seen = new Set<string>();
  for (let id: string | undefined = start?.id; id && byId.has(id) && !seen.has(id); ) {
    seen.add(id);
    spine.push(id);
    const options = (out.get(id) ?? []).filter((e) => !seen.has(e.to));
    let next: FlowEdge | undefined;
    let bestDepth = -1;
    for (const e of options) {
      const d = reach(e.to, new Set(seen));
      if (d > bestDepth) {
        bestDepth = d;
        next = e;
      }
    }
    if (!next) break;
    spineEdges.set(id, next);
    id = next.to;
  }

  const branches = real.filter((e) => spineEdges.get(e.from)?.to !== e.to);
  const branchTargets = new Set(branches.map((e) => e.to));
  // A node the spine missed and no branch reaches would otherwise vanish from the slide.
  for (const n of nodes) if (!seen.has(n.id) && !branchTargets.has(n.id)) spine.push(n.id);

  return { byId, spine, spineEdges, branches, loops };
}

/** Render the flowchart to an <svg>, sized to its own content. */
export function renderFlowchart(
  nodes: FlowNode[],
  edges: FlowEdge[],
  decisionIds: string[],
): string {
  if (nodes.length === 0) return "";
  const { byId, spine, spineEdges, branches, loops } = walkFlow(nodes, edges);
  // Only ids. A "decision" that names no node is a model that read the slot as a place for prose,
  // which has happened, and a diamond is not drawn on a guess.
  const decisions = new Set(decisionIds.filter((d) => byId.has(d)));

  const cols = Math.min(MAX_PER_ROW, Math.max(2, Math.ceil(spine.length / Math.ceil(spine.length / MAX_PER_ROW))));
  const nw = (W - (cols - 1) * GAP_X) / cols;

  // Serpentine: each row reads back the way the last one came, so the node ending a row sits in
  // the same column as the node starting the next and the turn between them is a straight line.
  const rows: string[][] = [];
  for (let i = 0; i < spine.length; i += cols) rows.push(spine.slice(i, i + cols));
  const colOf = (row: number, i: number) => (row % 2 === 0 ? i : (rows[row]?.length ?? 1) - 1 - i);

  const box = new Map<string, Box>();
  const rowY: number[] = [];
  let y = PAD;
  rows.forEach((ids, r) => {
    rowY.push(y);
    ids.forEach((id, i) => {
      box.set(id, { x: colOf(r, i) * (nw + GAP_X), y, w: nw, h: NH });
    });
    const hasBranch = ids.some((id) => branches.some((b) => b.from === id));
    y += NH + (hasBranch ? BRANCH_H : 0) + GAP_Y;
  });

  // A branch's destination hangs directly under the node it leaves.
  for (const b of branches) {
    if (box.has(b.to)) continue;
    const from = box.get(b.from);
    if (!from) continue;
    box.set(b.to, { x: from.x, y: from.y + NH + 44, w: nw, h: NH });
  }

  const H = Math.max(...[...box.values()].map((b) => b.y + b.h)) + PAD + 4;

  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) =>
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}" marker-end="url(#fc-ah${cls === "fc-l bad" ? "-bad" : ""})"/>`);
  const label = (x: number, y: number, t: string, cls = "fc-el") =>
    parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="middle">${escapeHtml(t)}</text>`);

  // Along each row, then the turn into the next.
  rows.forEach((ids, r) => {
    const ltr = r % 2 === 0;
    ids.forEach((id, i) => {
      const e = spineEdges.get(id);
      const a = box.get(id);
      if (!e || !a) return;
      const b = box.get(e.to);
      if (!b) return;
      const sameRow = i < ids.length - 1 && ids.includes(e.to);
      if (sameRow) {
        const [x1, x2] = ltr ? [a.x + a.w, b.x] : [a.x, b.x + b.w];
        line(x1, a.y + NH / 2, x2, a.y + NH / 2, "fc-l");
        if (e.label) label((x1 + x2) / 2, a.y + NH / 2 - 10, e.label);
      } else if (rows[r + 1]?.[0] === e.to) {
        // The turn: same column, so it drops straight down.
        line(a.x + a.w / 2, a.y + NH, b.x + b.w / 2, b.y, "fc-l");
        if (e.label) label(a.x + a.w / 2 + 26, (a.y + NH + b.y) / 2, e.label);
      }
    });
  });

  // The branches, drawn rather than described.
  for (const b of branches) {
    const from = box.get(b.from);
    const to = box.get(b.to);
    if (!from || !to) continue;
    const cls = "fc-l bad";
    line(from.x + from.w / 2, from.y + from.h, to.x + to.w / 2, to.y, cls);
    if (b.label) label(from.x + from.w / 2 + 20, from.y + from.h + 22, b.label, "fc-el bad");
  }

  // A loop, as an arc over the node it belongs to, held off the node's centre line because that
  // is where the turn from the row above arrives: drawn centred, the two crossed each other on
  // the one node that had both.
  for (const [id, text] of loops) {
    const a = box.get(id);
    if (!a) continue;
    const cx = a.x + a.w * 0.74;
    const r = Math.min(26, a.w / 5);
    parts.push(
      `<path d="M ${(cx - r).toFixed(1)} ${a.y} C ${(cx - r).toFixed(1)} ${(a.y - 30).toFixed(1)}, ${(cx + r).toFixed(1)} ${(a.y - 30).toFixed(1)}, ${(cx + r).toFixed(1)} ${a.y}" class="fc-loop" marker-end="url(#fc-ah2)"/>`,
    );
    if (text) label(cx, a.y - 34, text, "fc-el loop");
  }

  // The nodes last, so a line never crosses a label.
  for (const id of [...box.keys()]) {
    const b = box.get(id);
    const n = byId.get(id);
    if (!b || !n) continue;
    const isDec = decisions.has(id);
    const isBranchTarget = branches.some((e) => e.to === id);
    if (isDec) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const rx = Math.min(b.w / 2, 78);
      parts.push(
        `<polygon points="${cx},${b.y - 6} ${cx + rx},${cy} ${cx},${b.y + b.h + 6} ${cx - rx},${cy}" class="fc-dec"/>`,
      );
    } else {
      parts.push(`<rect x="${b.x.toFixed(1)}" y="${b.y}" width="${b.w.toFixed(1)}" height="${b.h}" rx="12" class="fc-box${isBranchTarget ? " bad" : ""}"/>`);
    }
    const fs = 14;
    const lines = wrap(plain(n.label), b.w - 18, fs);
    const cls = isDec ? "fc-t dec" : isBranchTarget ? "fc-t bad" : "fc-t";
    const y0 = b.y + b.h / 2 + (lines.length === 1 ? 5 : -3);
    parts.push(
      `<text x="${(b.x + b.w / 2).toFixed(1)}" y="${y0.toFixed(1)}" class="${cls}" text-anchor="middle">` +
        lines.map((l, i) => `<tspan x="${(b.x + b.w / 2).toFixed(1)}" dy="${i === 0 ? 0 : 16}">${escapeHtml(l)}</tspan>`).join("") +
        `</text>`,
    );
  }

  const defs =
    `<defs>` +
    `<marker id="fc-ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3 L0,6 Z" class="fc-ahp"/></marker>` +
    `<marker id="fc-ah-bad" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3 L0,6 Z" class="fc-ahp bad"/></marker>` +
    `<marker id="fc-ah2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" class="fc-ahp loop"/></marker>` +
    `</defs>`;

  // The viewBox starts above zero to leave room for a loop arc and its label, which are the only
  // things drawn outside a node's own band.
  return `<svg class="fc" viewBox="0 -44 ${W} ${H + 44}" width="100%" role="img">${defs}${parts.join("")}</svg>`;
}
