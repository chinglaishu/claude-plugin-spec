// NO `covers:` YET — deliberately. The behaviour below implements founding design §10.3, but §10.3 is
// a decision, not a requirement, and the REQ that would state it (REQ-KG-CTX-02, drafted for the CEO)
// is not approved. Pointing `covers:` at an unapproved id would be a dangling edge asserting proof of
// something no doc promises, which is the false claim this tool exists to detect.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "./discover";
import { contextPack } from "./agentContext";
import { loadConfig, type Config } from "./config";
import { pruneBaseline, ungovernedPaths, writeBaseline } from "./ungovernedBaseline";
import type { GitRunner } from "./gitDates";
import type { Graph } from "./types";

/**
 * The frozen baseline of already-ungoverned paths (founding design §10.3): "existing untouched code
 * stays legal; new ungoverned code fails the build."
 *
 * Tested against the one-repo fixture, whose governance is deliberately mixed — `src/checkout.ts` is
 * governed by a doc's `governs:`, `src/checkout.test.ts` only by a feature's path glob, and the rest
 * of the tree by nothing at all.
 */
const FIXTURES = join(__dirname, "..", "fixtures");
const PINNED = "2000-01-01T00:00:00.000Z";
const NO_GIT: GitRunner = async () => null;

let graph: Graph;
let config: Config;

beforeAll(async () => {
  config = await loadConfig(join(FIXTURES, "one-repo"));
  graph = await buildGraph(join(FIXTURES, "one-repo"), PINNED, config, NO_GIT);
});

describe("ungovernedPaths — what the baseline is allowed to excuse", () => {
  const paths = ["src/checkout.ts", "src/checkout.test.ts", "e2e/orphan.spec.ts", "CLAUDE.md"];

  it("omits a path a doc governs", () => {
    expect(ungovernedPaths(graph, config, paths)).not.toContain("src/checkout.ts");
  });

  // The SECOND route to ownership. A generator that only consulted `governs:` edges would excuse
  // every unit test in the project, and the gate would then never engage on the code they cover.
  it("omits a path claimed only by a feature's glob", () => {
    expect(ungovernedPaths(graph, config, paths)).not.toContain("src/checkout.test.ts");
  });

  it("keeps the paths nothing governs", () => {
    const out = ungovernedPaths(graph, config, paths);
    expect(out).toContain("e2e/orphan.spec.ts");
    expect(out).toContain("CLAUDE.md");
  });

  it("is sorted and deduped, so a re-run writes identical bytes", () => {
    const out = ungovernedPaths(graph, config, ["b.ts", "a.ts", "b.ts"]);
    expect(out).toEqual(["a.ts", "b.ts"]);
  });
});

describe("pruneBaseline — the ratchet only ever turns one way", () => {
  it("drops a path that has since become governed", () => {
    expect(pruneBaseline(["a.ts", "b.ts"], ["a.ts"])).toEqual(["a.ts"]);
  });

  // The move this project never makes: a newly-written ungoverned file must NOT be able to enter an
  // existing baseline, or the gate can always be cleared by re-running the generator.
  it("refuses to admit a path the frozen baseline never had", () => {
    expect(pruneBaseline(["a.ts"], ["a.ts", "brand-new.ts"])).toEqual(["a.ts"]);
  });
});

describe("writeBaseline — the artifact the briefing hook actually reads", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "kg-baseline-"));
    await cp(join(FIXTURES, "one-repo"), root, { recursive: true });
  });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  const baselineFile = () => join(root, config.artifactDir, "ungoverned-baseline.json");

  it("writes a top-level JSON ARRAY", async () => {
    await writeBaseline({ repoRoot: root, config, graph, mode: "create" });
    const parsed = JSON.parse(await readFile(baselineFile(), "utf8"));
    // agentContextCli treats a NON-array as *absent*, and absent means "never halt". An object
    // wrapper here would look like a successful init while silently disabling the gate forever.
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toContain("e2e/orphan.spec.ts");
    expect(parsed).not.toContain("src/checkout.ts");
  });

  // The round trip is the real claim: what was written must grandfather what already existed while
  // still halting on something new.
  it("grandfathers what it recorded, and still halts on a path written afterwards", async () => {
    const baseline = JSON.parse(await readFile(baselineFile(), "utf8")) as string[];
    const known = contextPack(graph, config, "e2e/orphan.spec.ts", baseline);
    expect(known.halt).toBe(false);
    expect(known.grandfathered).toBe(true);
    const fresh = contextPack(graph, config, "src/newly-written.ts", baseline);
    expect(fresh.halt).toBe(true);
  });

  it("refuses to overwrite a frozen baseline, leaving it byte-identical", async () => {
    const before = await readFile(baselineFile(), "utf8");
    await writeFile(join(root, "src", "sneaked-in.ts"), "export const x = 1;\n");
    await expect(writeBaseline({ repoRoot: root, config, graph, mode: "create" })).rejects.toThrow(/frozen/i);
    expect(await readFile(baselineFile(), "utf8")).toBe(before);
  });

  it("prune keeps the count falling and never admits the new file", async () => {
    const result = await writeBaseline({ repoRoot: root, config, graph, mode: "prune" });
    expect(result.paths).not.toContain("src/sneaked-in.ts");
    const parsed = JSON.parse(await readFile(baselineFile(), "utf8")) as string[];
    expect(parsed).not.toContain("src/sneaked-in.ts");
    expect(parsed).toContain("e2e/orphan.spec.ts");
  });

  // Pruning what was never frozen would intersect against an empty set and write `[]` — "nothing is
  // excused" — turning a mistyped flag into a repo-wide halt.
  it("refuses to prune a project that has no frozen baseline", async () => {
    const virgin = await mkdtemp(join(tmpdir(), "kg-baseline-virgin-"));
    await cp(join(FIXTURES, "one-repo"), virgin, { recursive: true });
    await expect(writeBaseline({ repoRoot: virgin, config, graph, mode: "prune" })).rejects.toThrow(/no .*baseline/i);
    await rm(virgin, { recursive: true, force: true });
  });

  // An enumeration that silently found nothing would write `[]` — "nothing is excused" — and halt
  // the user out of every file in their own repo. Refusing costs one error message.
  it("throws rather than freezing an empty baseline when nothing was scanned", async () => {
    const empty = await mkdtemp(join(tmpdir(), "kg-baseline-empty-"));
    await mkdir(join(empty, config.artifactDir), { recursive: true });
    await expect(writeBaseline({ repoRoot: empty, config, graph, mode: "create" })).rejects.toThrow(/no files/i);
    await rm(empty, { recursive: true, force: true });
  });
});
