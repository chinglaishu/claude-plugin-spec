import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { report, writeArtifacts } from "./artifacts";
import { healthForGraph } from "./summarize";
const g = { generatedAt: "T", nodes: [], edges: [], issues: [{ kind: "orphan-doc", node: "backend:x", detail: "d" }] } as any;
describe("report", () => {
  it("keeps the existing summary shape", () => {
    expect(report(g)).toContain("**Issues:** 1");
  });
  it("appends a Since-last-sync section when delta lines are given", () => {
    const r = report(g, ["+1 requirement (backend:req-x)"]);
    expect(r).toContain("## Since last sync");
    expect(r).toContain("+1 requirement");
  });
  it("adds a Results timestamp line after Generated when lastRun exists", () => {
    const withRun = { ...g, lastRun: { at: "2026-07-03T00:00:00Z", commit: "abc1234" } };
    const r = report(withRun);
    expect(r).toContain("Generated: T\n\nResults: 2026-07-03T00:00:00Z (abc1234)\n");
  });
  it("shows 'Results: none recorded' when lastRun is absent", () => {
    const r = report(g);
    expect(r).toContain("Generated: T\n\nResults: none recorded\n");
  });
});

describe("writeArtifacts", () => {
  // A project adopting the tool has no artifact dir yet — it is the project's data, not something
  // the tool ships (§10.9, TOOL_DIR). Until phase 3 this threw ENOENT on the very first build,
  // because the dir had only ever existed by virtue of the tool living inside it. Self-hosting
  // found it: `npm run build` on this repo crashed writing knowledge-graph.json.
  it("creates the output directory when the project has none yet", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "kg-artifacts-"));
    const outDir = join(tmp, "knowledge-graph");
    try {
      const base = { generatedAt: "T", nodes: [], edges: [], issues: [] } as any;
      // health is attached by the build, not by the parsers — mirror that rather than invent a shape.
      const empty = { ...base, health: healthForGraph(base) };
      await writeArtifacts(empty, outDir);
      const written = JSON.parse(await readFile(join(outDir, "knowledge-graph.json"), "utf8"));
      expect(written.nodes).toEqual([]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
