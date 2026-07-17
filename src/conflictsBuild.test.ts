import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "./discover";

let root: string;
const finding = (subject: string) => ({
  subject, category: "formula", severity: "high", tags: ["pfl"], why: "x",
  positions: [{ id: "A", statement: "s1", heldBy: ["doc:a"] }, { id: "B", statement: "s2", heldBy: ["code:b"] }],
  participants: [
    { kind: "doc", ref: "doc:a", quote: "s1", positionId: "A" },
    { kind: "code", ref: "b.py", quote: "s2", positionId: "B" },
  ],
});

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "kg-conf-"));
  await mkdir(join(root, "tools/knowledge-graph/conflicts"), { recursive: true });
  await writeFile(
    join(root, "tools/knowledge-graph/conflicts/pfl.conflicts.json"),
    JSON.stringify({ scope: "pfl", findings: [finding("beta"), finding("alpha")] }),
  );
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("buildGraph — conflicts fold", () => {
  it("attaches graph.conflicts, sorted by id, from source files", async () => {
    const g = await buildGraph(root, "2026-07-10T00:00:00.000Z");
    expect(g.conflicts).toBeDefined();
    expect(g.conflicts!.length).toBe(2);
    const ids = g.conflicts!.map((f) => f.id);
    expect(ids).toEqual([...ids].sort()); // deterministic order
  });
  it("adds no issues for findings (zero ratchet impact)", async () => {
    const g = await buildGraph(root, "2026-07-10T00:00:00.000Z");
    expect(g.issues.some((i) => JSON.stringify(i).includes("conflict"))).toBe(false);
  });
  it("omits graph.conflicts entirely when there are no source files", async () => {
    const empty = await mkdtemp(join(tmpdir(), "kg-empty-"));
    const g = await buildGraph(empty, "2026-07-10T00:00:00.000Z");
    expect(g.conflicts).toBeUndefined();
    await rm(empty, { recursive: true, force: true });
  });
});
