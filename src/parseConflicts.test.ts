// covers: REQ-KG-CONF-04
import { describe, it, expect } from "vitest";
import { parseConflicts, foldConflicts } from "./parseConflicts";

const file = (scope: string, findings: unknown[]) => ({
  path: `tools/knowledge-graph/conflicts/${scope}.conflicts.json`,
  content: JSON.stringify({ scope, generatedAt: "2026-07-10T00:00:00.000Z", findings }),
});
const finding = (subject: string) => ({
  subject, category: "formula", severity: "high", tags: ["pfl"], why: "x",
  positions: [{ id: "A", statement: "s1", heldBy: ["doc:a"] }, { id: "B", statement: "s2", heldBy: ["code:b"] }],
  participants: [
    { kind: "doc", ref: "doc:a", quote: "s1", positionId: "A" },
    { kind: "code", ref: "b.py", quote: "s2", positionId: "B" },
  ],
});

describe("parseConflicts", () => {
  it("parses valid findings and stamps ids + scope", () => {
    const out = parseConflicts(file("pfl", [finding("net_margin denominator")]));
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe("pfl");
    expect(out[0].id).toMatch(/^cf-/);
  });
  it("drops invalid findings but keeps valid ones", () => {
    const out = parseConflicts(file("pfl", [finding("ok"), { subject: "" }]));
    expect(out.map((f) => f.subject)).toEqual(["ok"]);
  });
  it("falls back to the filename stem when scope is absent", () => {
    const out = parseConflicts({ path: "conflicts/bil.conflicts.json", content: JSON.stringify({ findings: [finding("q")] }) });
    expect(out[0].scope).toBe("bil");
  });
  it("returns [] for malformed JSON, never throws", () => {
    expect(parseConflicts({ path: "conflicts/x.conflicts.json", content: "{not json" })).toEqual([]);
  });
});

describe("foldConflicts", () => {
  it("dedupes by id (last wins) and sorts by id — deterministic", () => {
    const a = parseConflicts(file("pfl", [finding("alpha")]))[0];
    const b = parseConflicts(file("pfl", [finding("beta")]))[0];
    const dupA2 = { ...a, why: "newer" };
    const folded = foldConflicts([a, b, dupA2]);
    expect(folded).toHaveLength(2);
    expect(folded.map((f) => f.id)).toEqual([...folded.map((f) => f.id)].sort());
    const kept = folded.find((f) => f.id === a.id)!;
    expect(kept.why).toBe("newer"); // last wins
  });
});
