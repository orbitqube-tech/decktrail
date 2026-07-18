import { describe, it, expect } from "vitest";
import { renderFlowchart, walkFlow } from "./flowchart.js";

// A real automation flow, and the shape worth testing against: a spine, a decision with a
// rejecting branch, a self-loop, and enough nodes to need a second row.
const nodes = [
  { id: "qr", label: "QR scan" },
  { id: "assessment", label: "Assessment" },
  { id: "consent", label: "Consent?" },
  { id: "discard", label: "Discard" },
  { id: "score", label: "Score & store" },
  { id: "resource", label: "Resource email" },
  { id: "nudge", label: "Weekly nudge" },
  { id: "invite", label: "Reassess invite" },
  { id: "reassessment", label: "Reassessment" },
  { id: "improvement", label: "Improvement" },
  { id: "reporting", label: "Reporting" },
];
const edges = [
  { from: "qr", to: "assessment" },
  { from: "assessment", to: "consent" },
  { from: "consent", to: "score", label: "Yes" },
  { from: "consent", to: "discard", label: "No" },
  { from: "score", to: "resource" },
  { from: "resource", to: "nudge" },
  { from: "nudge", to: "nudge", label: "x12 weeks" },
  { from: "nudge", to: "invite" },
  { from: "invite", to: "reassessment" },
  { from: "reassessment", to: "improvement" },
  { from: "improvement", to: "reporting" },
];

describe("reading a graph", () => {
  it("finds the spine, the branch and the loop", () => {
    const { spine, branches, loops } = walkFlow(nodes, edges);
    // Starts where nothing points, follows the main path, and never wanders into the branch.
    expect(spine[0]).toBe("qr");
    expect(spine).toContain("reporting");
    expect(spine).not.toContain("discard");
    // The rejected path is a branch, drawn from the node it leaves.
    expect(branches).toEqual([{ from: "consent", to: "discard", label: "No" }]);
    // A self-loop belongs to its node; it is not a step to anywhere.
    expect(loops.get("nudge")).toBe("x12 weeks");
    expect(spine.filter((id) => id === "nudge")).toHaveLength(1);
  });

  it("keeps a node that nothing connects, rather than dropping it from the slide", () => {
    const { spine } = walkFlow([...nodes, { id: "orphan", label: "Orphan" }], edges);
    expect(spine).toContain("orphan");
  });

  it("follows the flow at a fork, not whichever edge was written first", () => {
    // A gate whose rejection is listed first and whose acceptance leads to the entire rest of the
    // process. Taking the first edge put the dead end on the spine and stacked everything else
    // underneath it as branches, which is a diagram of the wrong story.
    const n = [
      { id: "hit", label: "They click" },
      { id: "gate", label: "A crawler?" },
      { id: "no403", label: "403" },
      { id: "signin", label: "Sign in" },
      { id: "check", label: "Theirs?" },
      { id: "deck", label: "The deck" },
      { id: "trail", label: "The trail" },
    ];
    const e = [
      { from: "hit", to: "gate" },
      { from: "gate", to: "no403", label: "yes" }, // written first, and a dead end
      { from: "gate", to: "signin", label: "no" }, // written second, and the actual flow
      { from: "signin", to: "check" },
      { from: "check", to: "deck", label: "yes" },
      { from: "deck", to: "trail" },
    ];
    const { spine, branches } = walkFlow(n, e);
    expect(spine).toEqual(["hit", "gate", "signin", "check", "deck", "trail"]);
    expect(spine).not.toContain("no403");
    expect(branches).toEqual([{ from: "gate", to: "no403", label: "yes" }]);
  });

  it("does not loop forever on a cycle", () => {
    const { spine } = walkFlow(
      [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      [{ from: "a", to: "b" }, { from: "b", to: "a" }],
    );
    expect(spine).toEqual(["a", "b"]);
  });
});

describe("drawing it", () => {
  const svg = () => renderFlowchart(nodes, edges, ["consent"]);

  it("draws the three connections the CSS version could not", () => {
    const s = svg();
    // Every connection is a line or a path now. The CSS version could only join a node to the one
    // beside it, so the turn between rows was undrawn, the branch was a line of text, and the
    // loop was a badge.
    const lines = (s.match(/<line /g) ?? []).length;
    expect(lines).toBeGreaterThanOrEqual(9); // 8 spine steps across two rows, plus the branch
    expect(s).toContain("<path"); // the loop arc
    expect(s).toMatch(/<line[^>]*class="fc-l bad"/); // the branch, drawn and coloured
  });

  it("draws a decision as a diamond, and only when it names a node", () => {
    expect(svg()).toContain("<polygon");
    // A decision naming no node is a model that read the slot as a place for prose. It happened.
    expect(renderFlowchart(nodes, edges, ["Consent? Yes proceeds to score and store."])).not.toContain("<polygon");
  });

  it("carries the edge labels", () => {
    const s = svg();
    expect(s).toContain(">Yes<");
    expect(s).toContain(">No<");
    expect(s).toContain(">x12 weeks<");
  });

  it("keeps a loop clear of the arrow arriving at the same node", () => {
    // Both used to target the node's top centre and crossed on the one node that had both.
    const s = svg();
    const arc = s.match(/<path d="M ([\d.]+)/);
    expect(arc).toBeTruthy();
  });

  it("puts every node on the slide exactly once", () => {
    const s = svg();
    for (const n of nodes) {
      const label = typeof n.label === "string" ? n.label : "";
      const escaped = label.replace(/&/g, "&amp;");
      const hits = (s.match(new RegExp(`>${escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`, "g")) ?? []).length;
      expect(hits, `${n.id} appears ${hits} times`).toBe(1);
    }
  });

  it("escapes a label, since it is text from a model", () => {
    const s = renderFlowchart([{ id: "x", label: "<script>alert(1)</script>" }], [], []);
    expect(s).not.toContain("<script>");
  });

  it("renders nothing for no nodes, rather than an empty box", () => {
    expect(renderFlowchart([], [], [])).toBe("");
  });
});
