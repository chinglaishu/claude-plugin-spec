import { describe, it, expect } from "vitest";
import { parseConfig, repoOf, nsId, subdirOf, prefixOf, type Repos } from "./config";

/**
 * Phase 2.1 — the topology gets ONE owner (founding design §10.9).
 *
 * It is currently re-declared in four places: repo.ts (as a union TYPE), gitDates.ts, serve.ts, and
 * sources.ts — the third independent copy, added by the gate work a day earlier. The pattern is still
 * reproducing, which is why collapsing it is the defect rather than scope creep.
 */

const DOJO: Repos = [
  { name: "main", subdir: "" },
  { name: "backend", subdir: "dojostack_backend" },
  { name: "frontend", subdir: "dojostack_frontend" },
];

/** The degenerate case, and the one that proves "reusable" is real rather than aspirational. */
const SOLO: Repos = [{ name: "main", subdir: "" }];

describe("parseConfig — a half-valid config must never load", () => {
  const ok = { repos: DOJO };

  it("accepts a well-formed topology", () => {
    expect(parseConfig(JSON.stringify(ok))).toEqual(DOJO);
  });

  // A partial topology silently misfiles every node in the missing repo — the same class of failure as
  // the report-only gate: confidently wrong beats obviously broken, and costs more.
  it("rejects a config with no repos at all", () => {
    expect(() => parseConfig(JSON.stringify({ repos: [] }))).toThrow(/repos/i);
    expect(() => parseConfig(JSON.stringify({}))).toThrow(/repos/i);
  });

  it("rejects a topology with no root repo — something must own the workspace root", () => {
    expect(() => parseConfig(JSON.stringify({ repos: [{ name: "backend", subdir: "b" }] }))).toThrow(/root/i);
  });

  it("rejects two root repos — the root cannot be ambiguous", () => {
    const two = [{ name: "a", subdir: "" }, { name: "b", subdir: "" }];
    expect(() => parseConfig(JSON.stringify({ repos: two }))).toThrow(/root/i);
  });

  it("rejects duplicate repo names — ids would collide silently", () => {
    const dup = [{ name: "main", subdir: "" }, { name: "main", subdir: "x" }];
    expect(() => parseConfig(JSON.stringify({ repos: dup }))).toThrow(/duplicate|main/i);
  });

  it("rejects unparseable json rather than yielding an empty topology", () => {
    expect(() => parseConfig("{not json")).toThrow();
  });
});

describe("repoOf — derives the owning repo from a path, per config", () => {
  it("matches the longest subdir prefix", () => {
    expect(repoOf("dojostack_backend/services/x.py", DOJO)).toBe("backend");
    expect(repoOf("dojostack_frontend/src/a.ts", DOJO)).toBe("frontend");
  });

  it("falls back to the root repo when nothing else matches", () => {
    expect(repoOf("tools/knowledge-graph/src/x.ts", DOJO)).toBe("main");
    expect(repoOf(undefined, DOJO)).toBe("main");
  });

  // A prefix must be a PATH boundary, not a string prefix: "dojostack_backend_old/" is not the backend.
  it("only matches on a path boundary", () => {
    expect(repoOf("dojostack_backend_old/x.py", DOJO)).toBe("main");
  });

  it("works for a single-repo project — everything is the root", () => {
    expect(repoOf("src/discover.ts", SOLO)).toBe("main");
    expect(repoOf("anything/at/all.md", SOLO)).toBe("main");
  });
});

describe("nsId — namespaces a bare id by its owning repo", () => {
  it("prefixes with the repo name", () => {
    expect(nsId("dojostack_backend/.github/system-design/x.md", "sd-56", DOJO)).toBe("backend:sd-56");
    expect(nsId("tools/x/y.ts", "thing", DOJO)).toBe("main:thing");
  });

  it("namespaces by the root repo in a single-repo project", () => {
    expect(nsId("docs/x.md", "thing", SOLO)).toBe("main:thing");
  });
});

describe("subdirOf / prefixOf — the maps gitDates, sources and serve each re-declared", () => {
  it("resolves a repo's subdir and path prefix from config", () => {
    expect(subdirOf("backend", DOJO)).toBe("dojostack_backend");
    expect(prefixOf("backend", DOJO)).toBe("dojostack_backend/");
  });

  it("gives the root repo an empty subdir and an empty prefix", () => {
    expect(subdirOf("main", DOJO)).toBe("");
    expect(prefixOf("main", DOJO)).toBe("");
  });
});
