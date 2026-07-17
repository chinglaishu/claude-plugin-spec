// R2-B integration pin: fabricated Playwright JSON → parsePlaywrightJson → per-entry
// commit stamping (the same composition syncResults.ts performs) → mergeResults into a
// pre-existing results file whose entries PREDATE the error/commit fields → applyResults
// onto test nodes → renderViewer template data. Proves the whole last-run pipeline without
// re-running any real e2e (today's kg-test-results.json entries lack `error`/`commit` by
// design — they predate the schema and must render honestly, not be backfilled).
import { describe, it, expect } from "vitest";
import { parsePlaywrightJson } from "./parsePlaywrightReport";
import { mergeResults, normalizeResults, type ResultsFileV2 } from "./resultsFile";
import { applyResults } from "./parseResults";
import { renderViewer } from "./viewer";

const NOW = "2026-07-06T09:00:00.000Z";
const COMMIT = "9f8e7d6";

const playwrightReport = JSON.stringify({
  suites: [{ title: "underwrite.spec.ts", specs: [
    {
      title: "UW-8 reverse yield", ok: false,
      tests: [{ results: [
        { status: "failed", errors: [{ message: "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m\n\nLocator: getByTestId('npi-yield-trend')\n    at C:\\Users\\ching\\workspace\\dojostack\\dojostack_frontend\\e2e\\underwrite.spec.ts:88:3" }] },
        { status: "failed", errors: [{ message: "retry error — must not win" }] },
      ] }],
    },
    { title: "UW-9 auto landing", ok: true, tests: [{ results: [{ status: "passed" }] }] },
  ] }],
});

// A pre-R2B results file: entries have status/attempts/at but NO error/commit.
const existingFile = JSON.stringify({
  generatedAt: "2026-07-05T12:00:00.000Z", commit: "a0f73d76",
  results: { "uw-7": { status: "fail", attempts: 2, at: "2026-07-05T12:00:00.000Z" } },
});

describe("last-run pipeline (fabricated report → node → viewer data)", () => {
  const titles = new Map([["UW-8 reverse yield", "uw-8"], ["UW-9 auto landing", "uw-9"]]);
  const parsed = parsePlaywrightJson(playwrightReport, titles);
  // Same shape syncResults.ts builds: per-entry `at` + per-entry `commit`.
  const incoming: ResultsFileV2 = {
    generatedAt: NOW, commit: COMMIT,
    results: Object.fromEntries(Object.entries(parsed).map(([id, r]) => [id, { ...r, at: NOW, commit: COMMIT }])),
  };
  const merged = mergeResults(normalizeResults(existingFile), incoming, true);
  const mergedJson = JSON.stringify(merged);

  const graph = {
    generatedAt: "T",
    nodes: [
      { id: "frontend:uw-7", type: "test", title: "UW-7", status: "todo", kind: "e2e" },
      { id: "frontend:uw-8", type: "test", title: "UW-8", status: "todo", kind: "e2e" },
      { id: "frontend:uw-9", type: "test", title: "UW-9", status: "todo", kind: "e2e" },
      { id: "frontend:uw-99", type: "test", title: "UW-99", status: "todo", kind: "e2e" },
    ],
    edges: [], issues: [],
  } as any;
  const g = applyResults(graph, mergedJson);
  const node = (id: string) => g.nodes.find((n: any) => n.id === id) as any;

  it("failed case: node carries status/attempts/runAt/lastError/runCommit, cleaned and truncated", () => {
    const n = node("frontend:uw-8");
    expect(n.status).toBe("fail");
    expect(n.attempts).toBe(2);
    expect(n.runAt).toBe(NOW);
    expect(n.runCommit).toBe(COMMIT);
    expect(n.lastError).toContain("Error: expect(locator).toBeVisible() failed");
    expect(n.lastError).not.toContain("\u001b");           // ANSI stripped
    expect(n.lastError).not.toMatch(/[A-Za-z]:\\Users/);   // no absolute-path leakage
    expect(n.lastError).not.toContain("retry error");      // first attempt's message wins
  });

  it("passing case: run info stamped, but never an error", () => {
    const n = node("frontend:uw-9");
    expect(n.status).toBe("pass");
    expect(n.runCommit).toBe(COMMIT);
    expect(n.lastError).toBeUndefined();
  });

  it("pre-R2B entry survives the scoped merge and stamps WITHOUT invented error/commit", () => {
    const n = node("frontend:uw-7");
    expect(n.status).toBe("fail");
    expect(n.runAt).toBe("2026-07-05T12:00:00.000Z");
    expect(n.lastError).toBeUndefined();
    expect(n.runCommit).toBeUndefined();
  });

  it("never-run case keeps its authored status and no run fields", () => {
    const n = node("frontend:uw-99");
    expect(n.status).toBe("todo");
    expect(n.runAt).toBeUndefined();
  });

  it("viewer data blob carries lastError/runCommit for the template to render", () => {
    const template = `<html><script>var KG=/*__KG_DATA__*/{nodes:[],edges:[],issues:[]}/*__KG_END__*/;</script></html>`;
    const out = renderViewer(g, template);
    const m = out.match(/var KG=(\{[\s\S]*\});/);
    expect(m).not.toBeNull();
    const kg = JSON.parse(m![1]);
    const uw8 = kg.nodes.find((n: any) => n.id === "frontend:uw-8");
    expect(uw8.lastError).toContain("expect(locator).toBeVisible() failed");
    expect(uw8.runCommit).toBe(COMMIT);
    // Determinism constraint: the generated HTML embeds only ISO strings — no
    // computed relative times may leak into build output (browser computes those).
    expect(uw8.runAt).toBe(NOW);
  });
});
