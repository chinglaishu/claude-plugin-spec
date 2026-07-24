// covers: REQ-KG-CTX-01
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { contextPack, renderPack } from "./agentContext";
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

async function packForBaseline(fixture: string, path: string, baseline?: string[]) {
  const root = join(FIXTURES, fixture);
  const config = await loadConfig(root);
  const graph = await buildGraph(root, PINNED, config, NO_GIT);
  return contextPack(graph, config, path, baseline);
}

/** A project with a frozen-but-empty baseline: governed, and nothing grandfathered. */
const packFor = (fixture: string, path: string) => packForBaseline(fixture, path, []);

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

/**
 * Generated requirements are a MIRROR of the code, so they cannot contradict it — if the code is
 * wrong, a drafted requirement documents the bug as intent. That is tolerable while it is visibly
 * unapproved and fatal the moment it reads like a decision the CEO made, so the briefing has to tell
 * the two apart. Without this, `kg-draft-spec` would quietly launder generated prose into canon.
 */
describe("contextPack — a drafted requirement is not an approved one", () => {
  const graph: any = {
    generatedAt: "",
    nodes: [
      { id: "main:drafted", type: "doc", title: "Checkout (drafted)", path: ".github/system-design/D.md", status: "draft" },
      { id: "main:approved", type: "doc", title: "Pricing", path: ".github/system-design/A.md", status: "current" },
      { id: "REQ-D-1", type: "requirement", title: "Totals sum line items.", text: "Totals sum line items." },
      { id: "REQ-A-1", type: "requirement", title: "A voucher never goes below zero.", text: "A voucher never goes below zero." },
    ],
    edges: [
      { from: "main:drafted", to: "src/pay.ts", type: "governs" },
      { from: "main:approved", to: "src/pay.ts", type: "governs" },
      { from: "main:drafted", to: "REQ-D-1", type: "specifies" },
      { from: "main:approved", to: "REQ-A-1", type: "specifies" },
    ],
    issues: [],
  };
  const config: any = { repos: [{ name: "main", subdir: "" }] };

  it("marks a requirement whose owning doc is still a draft", () => {
    const pack = contextPack(graph, config, "src/pay.ts", []);
    expect(pack.requirements.find((r) => r.id === "REQ-D-1")?.draft).toBe(true);
    expect(pack.requirements.find((r) => r.id === "REQ-A-1")?.draft).toBe(false);
  });

  it("says so in the briefing, in words that stop someone treating it as decided", () => {
    const text = renderPack(contextPack(graph, config, "src/pay.ts", []));
    expect(text).toMatch(/UNAPPROVED DRAFT/);
    // The warning must attach to the drafted requirement, not float loose at the bottom.
    const line = text.split("\n").find((l) => l.includes("REQ-D-1"))!;
    expect(line).toMatch(/UNAPPROVED DRAFT/);
    expect(text.split("\n").find((l) => l.includes("REQ-A-1"))).not.toMatch(/UNAPPROVED DRAFT/);
  });
});

describe("contextPack — multi-repo, where a hardcoded prefix would break", () => {
  // These two replace a pair that asserted `Array.isArray(...)` and `toBeTruthy()` — both of which
  // passed just as happily when the pack came back completely empty, so they proved nothing about
  // the multi-repo resolution they were named for. Rule 5 cuts the other way here: strengthening a
  // test that could not fail is not weakening it.
  //
  // The multi-repo fixture declares no `governs:` anywhere, so ownership comes from a FEATURE whose
  // path glob is workspace-relative and reaches into a nested sibling repo. That crossing is the
  // multi-repo resolution.
  it("lets a feature's glob claim a path inside a nested sibling repo", async () => {
    const pack = await packFor("multi-repo", "svc_backend/tests/test_rates.py");
    expect(pack.features.map((f) => f.id).some((id) => id.endsWith(":rates-api"))).toBe(true);
    expect(pack.halt).toBe(false);
  });

  it("does not let one sibling's glob claim another sibling's path", async () => {
    const pack = await packFor("multi-repo", "svc_frontend/src/rates/widget.test.ts");
    // rates-widget covers svc_frontend/src/rates/**; rates-api covers svc_backend/tests/** only.
    const ids = pack.features.map((f) => f.id);
    expect(ids.some((id) => id.endsWith(":rates-widget"))).toBe(true);
    expect(ids.some((id) => id.endsWith(":rates-api"))).toBe(false);
  });

  it("halts on a nested-repo path that nothing claims", async () => {
    const pack = await packFor("multi-repo", "svc_backend/app/unclaimed.py");
    expect(pack.halt).toBe(true);
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

/**
 * The frozen baseline (§10.3) — "existing untouched code stays legal; new ungoverned code fails".
 *
 * Without this the pack halts on EVERY file of any project that has not been governed yet, which is
 * every project on the day it installs the plugin. Halting a user out of their own repo on install
 * is not a strict gate, it is a broken product — and the ratchet idiom for exactly this was already
 * a locked decision.
 */
describe("contextPack — the frozen baseline", () => {
  const pack = (path: string, baseline?: string[]) =>
    packForBaseline("one-repo", path, baseline);

  it("never halts when the project has NO baseline — it is not governed yet", async () => {
    const p = await pack("src/totallyNewThing.ts", undefined);
    expect(p.halt).toBe(false);
    expect(p.grandfathered).toBe(true);
  });

  it("does not halt on ungoverned code the baseline already froze", async () => {
    const p = await pack("src/legacyThing.ts", ["src/legacyThing.ts"]);
    expect(p.halt).toBe(false);
    expect(p.grandfathered).toBe(true);
  });

  it("HALTS on ungoverned code the baseline does not know — this is new", async () => {
    const p = await pack("src/brandNew.ts", ["src/legacyThing.ts"]);
    expect(p.halt).toBe(true);
    expect(p.grandfathered).toBe(false);
  });

  it("never grandfathers a governed path — governance is not a concession", async () => {
    const p = await pack("src/checkout.ts", []);
    expect(p.halt).toBe(false);
    expect(p.grandfathered).toBe(false);
  });
});

describe("renderPack — the text staff actually reads", () => {
  it("leads with STOP and nothing else when the path is ungoverned", async () => {
    const text = renderPack(await packFor("one-repo", "src/totallyNewThing.ts"));
    expect(text).toContain("STOP");
    // The briefing must not also print a requirements section: a halt that still renders a normal
    // pack invites skimming past it, which is the `|| echo` failure in presentation form.
    expect(text).not.toContain("## Requirements");
  });

  it("names the requirement and what proves it, and flags what proves nothing", async () => {
    const text = renderPack(await packFor("one-repo", "src/checkout.ts"));
    expect(text).toContain("## Governed by");
    expect(text).toContain("NO COVERING TEST");
  });
});
