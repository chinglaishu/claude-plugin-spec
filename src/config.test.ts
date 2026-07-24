// covers: REQ-KG-CORE-02
import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseConfig,
  loadConfig,
  repoOf,
  nsId,
  subdirOf,
  prefixOf,
  siblingsOf,
  knowledgeGlobs,
  e2ePath,
  artifactPath,
  stripRepoPrefix,
  CONFIG_FILE,
  type Repos,
  type Config,
} from "./config";

/**
 * Phase 2 — the topology, the paths and the runners get ONE owner (founding design §10.8, §10.9).
 *
 * The topology used to be re-declared in four places: repo.ts (as a union TYPE), gitDates.ts, serve.ts,
 * and sources.ts — the third independent copy, added by the gate work a day earlier. The pattern was
 * still reproducing, which is why collapsing it is the defect rather than scope creep.
 */

/** A three-repo workspace: one root plus two nested siblings. The shape REQ-0 is measured against. */
const TRIO: Repos = [
  { name: "main", subdir: "" },
  { name: "backend", subdir: "svc_backend" },
  { name: "frontend", subdir: "svc_frontend" },
];

/** The degenerate case, and the one that proves "reusable" is real rather than aspirational. */
const SOLO: Repos = [{ name: "main", subdir: "" }];

const cfg = (json: unknown) => parseConfig(JSON.stringify(json));

describe("parseConfig — a half-valid config must never load", () => {
  it("accepts a well-formed topology", () => {
    expect(cfg({ repos: TRIO }).repos).toEqual(TRIO);
  });

  // A partial topology silently misfiles every node in the missing repo — the same class of failure as
  // the report-only gate: confidently wrong beats obviously broken, and costs more.
  it("rejects a config with no repos at all", () => {
    expect(() => cfg({ repos: [] })).toThrow(/repos/i);
    expect(() => cfg({})).toThrow(/repos/i);
  });

  it("rejects a topology with no root repo — something must own the workspace root", () => {
    expect(() => cfg({ repos: [{ name: "backend", subdir: "b" }] })).toThrow(/root/i);
  });

  it("rejects two root repos — the root cannot be ambiguous", () => {
    expect(() => cfg({ repos: [{ name: "a", subdir: "" }, { name: "b", subdir: "" }] })).toThrow(/root/i);
  });

  it("rejects duplicate repo names — ids would collide silently", () => {
    expect(() => cfg({ repos: [{ name: "main", subdir: "" }, { name: "main", subdir: "x" }] })).toThrow(/duplicate|main/i);
  });

  it("rejects unparseable json rather than yielding an empty topology", () => {
    expect(() => parseConfig("{not json")).toThrow();
  });

  // A runner naming a repo that does not exist would spawn a server in the wrong directory — or, with
  // a silent fallback, in the workspace root. Both are worse than refusing to start.
  it("rejects a runner pointed at a repo that does not exist", () => {
    expect(() => cfg({ repos: SOLO, runners: { backend: "nope" } })).toThrow(/nope/i);
  });
});

describe("parseConfig — defaults let a simple project say almost nothing", () => {
  it("fills every path from a repos-only config", () => {
    const c = cfg({ repos: SOLO });
    expect(c.e2eDir).toBe("e2e");
    expect(c.artifactDir).toBe("knowledge-graph");
    expect(c.unitTestGlobs).toEqual([]);
    expect(c.runners).toEqual({ backend: null, frontend: null });
  });

  it("takes explicit paths over the defaults", () => {
    const c = cfg({ repos: TRIO, e2eDir: "svc_frontend/e2e", artifactDir: "tools/kg" });
    expect(c.e2eDir).toBe("svc_frontend/e2e");
    expect(c.artifactDir).toBe("tools/kg");
  });

  it("strips trailing slashes so derived paths never double up", () => {
    expect(cfg({ repos: SOLO, e2eDir: "e2e/" }).e2eDir).toBe("e2e");
    expect(cfg({ repos: SOLO, artifactDir: "tools/kg//" }).artifactDir).toBe("tools/kg");
  });
});

describe("repoOf — derives the owning repo from a path, per config", () => {
  it("matches the longest subdir prefix", () => {
    expect(repoOf("svc_backend/services/x.py", TRIO)).toBe("backend");
    expect(repoOf("svc_frontend/src/a.ts", TRIO)).toBe("frontend");
  });

  it("falls back to the root repo when nothing else matches", () => {
    expect(repoOf("tools/knowledge-graph/src/x.ts", TRIO)).toBe("main");
    expect(repoOf(undefined, TRIO)).toBe("main");
  });

  // A prefix must be a PATH boundary, not a string prefix: "svc_backend_old/" is not the backend.
  it("only matches on a path boundary", () => {
    expect(repoOf("svc_backend_old/x.py", TRIO)).toBe("main");
  });

  it("prefers the deeper repo when one nests inside another", () => {
    const nested: Repos = [
      { name: "main", subdir: "" },
      { name: "outer", subdir: "packages" },
      { name: "inner", subdir: "packages/web" },
    ];
    expect(repoOf("packages/web/src/a.ts", nested)).toBe("inner");
    expect(repoOf("packages/api/src/a.ts", nested)).toBe("outer");
  });

  it("works for a single-repo project — everything is the root", () => {
    expect(repoOf("src/discover.ts", SOLO)).toBe("main");
    expect(repoOf("anything/at/all.md", SOLO)).toBe("main");
  });
});

describe("nsId — namespaces a bare id by its owning repo", () => {
  it("prefixes with the repo name", () => {
    expect(nsId("svc_backend/.github/system-design/x.md", "sd-56", TRIO)).toBe("backend:sd-56");
    expect(nsId("tools/x/y.ts", "thing", TRIO)).toBe("main:thing");
  });

  it("namespaces by the root repo in a single-repo project", () => {
    expect(nsId("docs/x.md", "thing", SOLO)).toBe("main:thing");
  });
});

describe("subdirOf / prefixOf — the maps gitDates, sources and serve each re-declared", () => {
  it("resolves a repo's subdir and path prefix from config", () => {
    expect(subdirOf("backend", TRIO)).toBe("svc_backend");
    expect(prefixOf("backend", TRIO)).toBe("svc_backend/");
  });

  it("gives the root repo an empty subdir and an empty prefix", () => {
    expect(subdirOf("main", TRIO)).toBe("");
    expect(prefixOf("main", TRIO)).toBe("");
  });

  it("throws on a repo the topology never declared", () => {
    expect(() => subdirOf("frontend", SOLO)).toThrow(/frontend/i);
  });
});

describe("siblingsOf — the non-root repos, in config order (sources.ts's SIBLINGS)", () => {
  it("lists every repo but the root, preserving order", () => {
    expect(siblingsOf(TRIO).map((r) => r.name)).toEqual(["backend", "frontend"]);
  });

  // The lockfile pins SIBLINGS. A single-repo project has none — and must not therefore be unpinnable
  // by definition; it simply has nothing to pin.
  it("is empty for a single-repo project", () => {
    expect(siblingsOf(SOLO)).toEqual([]);
  });
});

describe("stripRepoPrefix — a path relative to its OWN repo, not the workspace", () => {
  it("drops the owning repo's prefix", () => {
    expect(stripRepoPrefix("svc_frontend/src/a.test.ts", TRIO)).toBe("src/a.test.ts");
    expect(stripRepoPrefix("svc_backend/tests/test_x.py", TRIO)).toBe("tests/test_x.py");
  });

  it("leaves a root-repo path alone", () => {
    expect(stripRepoPrefix("tools/kg/src/x.test.ts", TRIO)).toBe("tools/kg/src/x.test.ts");
    expect(stripRepoPrefix("src/x.test.ts", SOLO)).toBe("src/x.test.ts");
  });

  it("normalizes windows separators before matching", () => {
    expect(stripRepoPrefix("svc_frontend\\src\\a.test.ts", TRIO)).toBe("src/a.test.ts");
  });
});

describe("derived paths — one fact, many uses", () => {
  const c = cfg({ repos: TRIO, e2eDir: "svc_frontend/e2e", artifactDir: "tools/kg" });

  it("hangs every e2e location off the one e2eDir", () => {
    expect(e2ePath(c, "kg-test-results.json")).toBe("svc_frontend/e2e/kg-test-results.json");
    expect(e2ePath(c, "features")).toBe("svc_frontend/e2e/features");
  });

  it("hangs every artifact off the one artifactDir", () => {
    expect(artifactPath(c, "knowledge-graph.json")).toBe("tools/kg/knowledge-graph.json");
  });

  // A project whose e2e suite sits at the workspace root must not yield a leading "/".
  it("does not leave a leading separator when e2eDir is the root", () => {
    const solo = cfg({ repos: SOLO, e2eDir: "" });
    expect(e2ePath(solo, "kg-test-results.json")).toBe("kg-test-results.json");
  });
});

describe("knowledgeGlobs — the indexed source patterns", () => {
  it("points the case/feature/cache globs at the configured e2eDir", () => {
    const globs = knowledgeGlobs(cfg({ repos: TRIO, e2eDir: "svc_frontend/e2e" }));
    expect(globs).toContain("svc_frontend/e2e/cases/**/*.cases.yaml");
    expect(globs).toContain("svc_frontend/e2e/features/**/*.features.yaml");
    expect(globs).toContain("svc_frontend/e2e/cache/**/*.cache.yaml");
  });

  // These are the tool's own conventions and hold for every project — they must not need configuring.
  it("keeps the repo-agnostic knowledge patterns", () => {
    const globs = knowledgeGlobs(cfg({ repos: SOLO }));
    expect(globs).toContain("**/.github/**/*.md");
    expect(globs).toContain("**/CLAUDE.md");
    expect(globs).toContain(".claude/skills/*/SKILL.md");
  });
});

describe("runners — which repo a server starts in (§12.7 stays open on the command itself)", () => {
  it("resolves a runner to its repo's subdir", () => {
    const c = cfg({ repos: TRIO, runners: { backend: "backend", frontend: "frontend" } });
    expect(c.runners).toEqual({ backend: "backend", frontend: "frontend" });
    expect(subdirOf(c.runners.backend!, c.repos)).toBe("svc_backend");
  });

  it("lets a single-repo project run everything from the root", () => {
    const c = cfg({ repos: SOLO, runners: { frontend: "main" } });
    expect(subdirOf(c.runners.frontend!, c.repos)).toBe("");
    expect(c.runners.backend).toBeNull();
  });
});

describe("loadConfig — reads the project's config from its own root", () => {
  const write = async (body: unknown) => {
    const dir = await mkdtemp(join(tmpdir(), "kg-config-"));
    await writeFile(join(dir, CONFIG_FILE), JSON.stringify(body));
    return dir;
  };

  it("loads and validates the file at the repo root", async () => {
    const dir = await write({ repos: TRIO, artifactDir: "tools/kg" });
    const c = await loadConfig(dir);
    expect(c.repos).toEqual(TRIO);
    expect(c.artifactDir).toBe("tools/kg");
  });

  /**
   * NO SILENT DEFAULT. A missing config could plausibly fall back to a single-repo topology — and that
   * is exactly the trap: against a multi-repo workspace it would namespace every backend node `main:`
   * instead of `backend:`, producing a complete, confident, wrong graph. Same class as the `|| echo`
   * gate. Refusing costs one error message; guessing costs a silently different SSoT.
   */
  it("refuses to guess when the project has no config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kg-noconfig-"));
    await expect(loadConfig(dir)).rejects.toThrow(new RegExp(CONFIG_FILE));
  });

  it("names the file when it is unreadable garbage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kg-badconfig-"));
    await writeFile(join(dir, CONFIG_FILE), "{not json");
    await expect(loadConfig(dir)).rejects.toThrow();
  });
});

/**
 * `exclude` — sub-trees that are NOT this project's knowledge (CEO 2026-07-24).
 *
 * The knowledge globs are deliberately repo-wide (`**\/CLAUDE.md`, `**\/.github/**\/*.md`) because the
 * tool defines where knowledge lives in ANY project. That is right until a repo contains a *second*
 * project as data — committed fixtures, samples, vendored trees — whose docs then get indexed as the
 * host's own. Self-hosting found it: this repo's REQ-1 fixtures collided on `main:claude` and
 * contributed four docs and three requirements that are not ours.
 *
 * It lives in config, never in the tool, because a hardcoded `fixtures/**` would re-introduce exactly
 * the project-specific coupling REQ-0 removed.
 */
const base = { repos: [{ name: "main", subdir: "" }] };
describe("exclude", () => {
  it("defaults to excluding nothing", () => {
    expect(parseConfig(JSON.stringify(base)).exclude).toEqual([]);
  });

  it("keeps a declared sub-tree out of the graph", () => {
    const c = parseConfig(JSON.stringify({ ...base, exclude: ["fixtures/**", "samples/**"] }));
    expect(c.exclude).toEqual(["fixtures/**", "samples/**"]);
  });

  it("rejects a non-array exclude rather than silently ignoring it", () => {
    expect(() => parseConfig(JSON.stringify({ ...base, exclude: "fixtures/**" }))).toThrow(/exclude/);
  });

  it("rejects non-string entries", () => {
    expect(() => parseConfig(JSON.stringify({ ...base, exclude: ["ok", 7] }))).toThrow(/exclude/);
  });
});
