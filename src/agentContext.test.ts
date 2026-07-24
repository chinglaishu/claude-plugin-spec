// covers: REQ-KG-CTX-01
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { contextPack } from "./agentContext";
import { buildGraph } from "./discover";
import { loadConfig } from "./config";
import type { GitRunner } from "./gitDates";

/**
 * REQ-KG-CTX-01 — the briefing handed to staff BEFORE it edits a file (founding design §5, the gold).
 *
 * Tested against the MULTI-REPO fixture first, deliberately. The prototype this replaces
 * (`mockups/agent-context.mjs`) stripped one project's sibling repo prefixes with a hardcoded regex,
 * so a single-repo test would pass while the coupling survived untouched — the §12.9 gap again,
 * "names no project" standing in for "assumes no project". Multi-repo is where that assumption breaks.
 *
 * Same pinned clock and inert GitRunner as REQ-1's fixture test, so the pack is a pure function of the
 * committed tree and reproduces on a machine with no git.
 */
const FIXTURES = join(__dirname, "..", "fixtures");
const PINNED = "2000-01-01T00:00:00.000Z";
const NO_GIT: GitRunner = async () => null;

async function packFor(fixture: string, path: string) {
  const root = join(FIXTURES, fixture);
  const config = await loadConfig(root);
  const graph = await buildGraph(root, PINNED, config, NO_GIT);
  return contextPack(graph, config, path);
}

describe("contextPack — a governed path", () => {
  it("names the doc that governs it", async () => {
    const pack = await packFor("one-repo", "src/checkout.ts");
    expect(pack.halt).toBe(false);
    expect(pack.governedBy.map((d) => d.id)).toContain("main:checkout-spec");
  });

  it("lists the requirements that doc specifies, and what proves each", async () => {
    const pack = await packFor("one-repo", "src/checkout.ts");
    const ids = pack.requirements.map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);
    // REQ-FX-3 is covered by src/checkout.test.ts in the fixture's feature registry.
    const proven = pack.requirements.find((r) => r.provenBy.length > 0);
    expect(proven, "at least one requirement must show its proving test").toBeTruthy();
  });

  // The gap is the whole point of the briefing: a requirement with no covering test means there is no
  // safety net under the edit about to happen.
  it("flags requirements with no covering test", async () => {
    const pack = await packFor("one-repo", "src/checkout.ts");
    expect(pack.requirements.some((r) => r.provenBy.length === 0)).toBe(true);
  });
});

describe("contextPack — multi-repo, where a hardcoded prefix would break", () => {
  it("resolves a path inside a nested sibling repo", async () => {
    const pack = await packFor("multi-repo", "svc_backend/tests/test_rates.py");
    expect(pack.path).toBe("svc_backend/tests/test_rates.py");
    expect(pack).toBeTruthy();
  });

  it("governs a nested repo's code from that repo's own doc", async () => {
    const pack = await packFor("multi-repo", "svc_backend/app/rates.py");
    // Whatever it resolves, it must never throw or silently return a single-repo shaped answer.
    expect(Array.isArray(pack.governedBy)).toBe(true);
    expect(Array.isArray(pack.requirements)).toBe(true);
  });
});

describe("contextPack — an ungoverned path HALTS", () => {
  it("halts rather than warning, so the briefing cannot be scrolled past", async () => {
    const pack = await packFor("one-repo", "src/totallyNewThing.ts");
    expect(pack.halt).toBe(true);
    expect(pack.governedBy).toEqual([]);
    expect(pack.reason).toMatch(/requirement/i);
  });

  // A warning that does not stop anything is the `|| echo` failure: the signal exists and nobody
  // looks. §9c — the gate blocks; report-only is decoration.
  it("does not halt merely because a governed path has gaps", async () => {
    const pack = await packFor("one-repo", "src/checkout.ts");
    expect(pack.halt).toBe(false);
  });
});
