import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseGitLog, docDates, type GitRunner } from "./gitDates";

// git log --format=%x00%aI --name-only emits, newest→oldest: a NUL then the ISO author date on one
// line, then the changed file paths one per line. parseGitLog collapses that to per-file created
// (oldest date seen) / updated (newest date seen), normalized to YYYY-MM-DD.
const NUL = "\x00";

describe("parseGitLog", () => {
  it("maps a single file in one commit with created == updated == that date", () => {
    const out = `${NUL}2026-07-10T12:00:00+08:00\ndocs/a.md\n`;
    const m = parseGitLog(out);
    expect(m.get("docs/a.md")).toEqual({ created: "2026-07-10", updated: "2026-07-10" });
    expect(m.size).toBe(1);
  });

  const multi = [
    `${NUL}2026-07-10T12:00:00+08:00`,
    "docs/a.md",
    "docs/b.md",
    "",
    `${NUL}2026-07-05T09:00:00+08:00`,
    "docs/a.md",
    "",
    `${NUL}2026-06-01T08:00:00+08:00`,
    "docs/a.md",
    "docs/c.md",
  ].join("\n");

  it("for a file across several commits, created = oldest and updated = newest (git emits newest→oldest)", () => {
    const m = parseGitLog(multi);
    expect(m.get("docs/a.md")).toEqual({ created: "2026-06-01", updated: "2026-07-10" });
  });

  it("tracks a file present in only some commits independently of the others", () => {
    const m = parseGitLog(multi);
    // b.md only in the newest commit; c.md only in the oldest commit
    expect(m.get("docs/b.md")).toEqual({ created: "2026-07-10", updated: "2026-07-10" });
    expect(m.get("docs/c.md")).toEqual({ created: "2026-06-01", updated: "2026-06-01" });
  });

  it("returns an empty map for empty output", () => {
    expect(parseGitLog("").size).toBe(0);
  });

  it("ignores blank lines, a malformed date header, and path lines with no date context", () => {
    const out = [
      "",                            // leading blank
      `${NUL}not-a-date`,            // malformed date header → no context set
      "orphan-before-any-date.md",   // path before any valid date → ignored
      `${NUL}2026-07-10T00:00:00Z`,  // valid header
      "",                            // blank between header and files
      "docs/a.md",
      "   ",                         // whitespace-only → ignored
    ].join("\n");
    const m = parseGitLog(out);
    expect(m.get("docs/a.md")).toEqual({ created: "2026-07-10", updated: "2026-07-10" });
    expect(m.has("orphan-before-any-date.md")).toBe(false);
    expect(m.size).toBe(1);
  });
});

describe("docDates — grouping, prefix strip/re-add, one process per repo (injected runner)", () => {
  it("runs one git process per repo group against the right root, strips the repo prefix for git, and re-adds it on the result keys", async () => {
    const calls: { cwd: string; relPaths: string[] }[] = [];
    const runner: GitRunner = async (cwd, relPaths) => {
      calls.push({ cwd, relPaths });
      if (cwd.endsWith("dojostack_backend"))
        return `${NUL}2026-07-10T00:00:00Z\n.github/system-design/foo.md\n\n${NUL}2026-03-03T00:00:00Z\n.github/memories/note.md\n`;
      if (cwd.endsWith("dojostack_frontend")) return `${NUL}2026-05-02T00:00:00Z\ne2e/cases/bar.cases.yaml\n`;
      return `${NUL}2026-01-01T00:00:00Z\nCLAUDE.md\n`; // main
    };
    const root = "/repo/root";
    const paths = [
      "dojostack_backend/.github/system-design/foo.md",
      "dojostack_backend/.github/memories/note.md",
      "dojostack_frontend/e2e/cases/bar.cases.yaml",
      "CLAUDE.md",
    ];
    const m = await docDates(root, paths, runner);

    // exactly one process per distinct repo (backend, frontend, main)
    expect(calls.length).toBe(3);

    const backendCall = calls.find((c) => c.cwd === join(root, "dojostack_backend"))!;
    expect(backendCall).toBeDefined();
    // repo prefix stripped; runner receives the repo-relative paths as an argv-ready array
    expect(backendCall.relPaths).toEqual([".github/system-design/foo.md", ".github/memories/note.md"]);

    expect(calls.find((c) => c.cwd === join(root, "dojostack_frontend"))?.relPaths).toEqual(["e2e/cases/bar.cases.yaml"]);
    expect(calls.find((c) => c.cwd === root)?.relPaths).toEqual(["CLAUDE.md"]); // main uses repoRoot itself

    // keys are the ORIGINAL input paths (prefix re-added)
    expect(m.get("dojostack_backend/.github/system-design/foo.md")).toEqual({ created: "2026-07-10", updated: "2026-07-10" });
    expect(m.get("dojostack_backend/.github/memories/note.md")).toEqual({ created: "2026-03-03", updated: "2026-03-03" });
    expect(m.get("dojostack_frontend/e2e/cases/bar.cases.yaml")).toEqual({ created: "2026-05-02", updated: "2026-05-02" });
    expect(m.get("CLAUDE.md")).toEqual({ created: "2026-01-01", updated: "2026-01-01" });
  });

  it("tolerates a per-repo git failure (runner returns null) — that group contributes nothing, others still resolve", async () => {
    const runner: GitRunner = async (cwd) => {
      if (cwd.endsWith("dojostack_backend")) return null; // non-git dir / git exited non-zero
      return `${NUL}2026-01-01T00:00:00Z\nCLAUDE.md\n`;
    };
    const m = await docDates("/root", ["dojostack_backend/x/y.md", "CLAUDE.md"], runner);
    expect(m.has("dojostack_backend/x/y.md")).toBe(false);
    expect(m.get("CLAUDE.md")).toEqual({ created: "2026-01-01", updated: "2026-01-01" });
  });

  it("tolerates a runner that throws (missing git binary) — caught and skipped, other groups resolve", async () => {
    const runner: GitRunner = async (cwd) => {
      if (cwd.endsWith("dojostack_frontend")) throw new Error("spawn git ENOENT");
      return `${NUL}2026-02-02T00:00:00Z\nCLAUDE.md\n`;
    };
    const m = await docDates("/root", ["dojostack_frontend/a.md", "CLAUDE.md"], runner);
    expect(m.has("dojostack_frontend/a.md")).toBe(false);
    expect(m.get("CLAUDE.md")).toEqual({ created: "2026-02-02", updated: "2026-02-02" });
  });

  it("returns an empty map and never spawns git when given no paths", async () => {
    let called = 0;
    const runner: GitRunner = async () => {
      called++;
      return "";
    };
    const m = await docDates("/root", [], runner);
    expect(m.size).toBe(0);
    expect(called).toBe(0);
  });
});

// Regression / smoke test for the real spawn path. The original defaultGitRunner used
// `git log ... --pathspec-from-file=- --pathspec-file-nul`, which git 2.32 rejects
// (`fatal: unrecognized argument: --pathspec-from-file=-`) → every process exited non-zero →
// docDates returned nothing for every node. This test exercises the DEFAULT runner (no injection)
// against a file known to be tracked in THIS repo, so a broken real spawn can never pass again.
const here = dirname(fileURLToPath(import.meta.url)); // .../tools/knowledge-graph/src
const repoRoot = join(here, "..", "..", ".."); // workspace (main) git repo root
function gitUsable(cwd: string): boolean {
  try {
    const r = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
    return r.status === 0 && String(r.stdout).trim() === "true";
  } catch {
    return false;
  }
}
const REAL_GIT = gitUsable(repoRoot);

describe("docDates — real git (default runner, no injection)", () => {
  it.skipIf(!REAL_GIT)("dates a tracked file via a real git spawn (created <= updated, both YYYY-MM-DD)", async () => {
    const tracked = "tools/knowledge-graph/package.json"; // main repo, cwd = repoRoot
    const m = await docDates(repoRoot, [tracked]); // DEFAULT runner — real `git log`
    const d = m.get(tracked);
    expect(d).toBeDefined();
    expect(d!.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d!.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d!.created! <= d!.updated!).toBe(true); // oldest commit no later than newest
  });
});
