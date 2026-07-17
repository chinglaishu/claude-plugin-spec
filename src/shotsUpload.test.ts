import { describe, it, expect, vi } from "vitest";
import {
  scanLocalShotDirs,
  planUpload,
  pruneShaSet,
  buildEvidenceIndex,
  runUpload,
  subprocessTimeoutMs,
  type ShotDirEntry,
  type FsLike,
  type GhLike,
} from "./shotsUpload";

// ── subprocessTimeoutMs: pure env resolver for the gh/git execFile timeouts ──
describe("subprocessTimeoutMs", () => {
  it("defaults to 30s when KG_SHOTS_SUBPROCESS_TIMEOUT_MS is unset", () => {
    expect(subprocessTimeoutMs({})).toBe(30_000);
  });

  it("is overridable via KG_SHOTS_SUBPROCESS_TIMEOUT_MS", () => {
    expect(subprocessTimeoutMs({ KG_SHOTS_SUBPROCESS_TIMEOUT_MS: "5000" })).toBe(5000);
  });

  it("falls back to the default on a non-numeric or non-positive override", () => {
    expect(subprocessTimeoutMs({ KG_SHOTS_SUBPROCESS_TIMEOUT_MS: "not-a-number" })).toBe(30_000);
    expect(subprocessTimeoutMs({ KG_SHOTS_SUBPROCESS_TIMEOUT_MS: "0" })).toBe(30_000);
    expect(subprocessTimeoutMs({ KG_SHOTS_SUBPROCESS_TIMEOUT_MS: "-5" })).toBe(30_000);
  });
});

// ── scanLocalShotDirs: pure given an injected directory-listing fs ──
describe("scanLocalShotDirs", () => {
  const fs = (tree: Record<string, string[]>): FsLike => ({
    listDir: async (dir: string) => tree[dir] ?? [],
  });

  it("scans both shot dirs (E2E_SHOTS_DIR default + e2e/.step-shots) and merges case dirs", () => {
    const tree: Record<string, string[]> = {
      "/ws/.kg-e2e-shots": ["ADD-2", "SMK-1"],
      "/ws/.kg-e2e-shots/ADD-2": ["add2-1-rent-roll.png", "add2-2-column-mapping.png"],
      "/ws/.kg-e2e-shots/SMK-1": ["smk-1-login-page.png"],
      "/fe/e2e/.step-shots": ["ADD-3"],
      "/fe/e2e/.step-shots/ADD-3": ["add3-1-rent-roll.png"],
    };
    return scanLocalShotDirs(fs(tree), { primary: "/ws/.kg-e2e-shots", fallback: "/fe/e2e/.step-shots" }).then((entries) => {
      expect(entries.map((e) => e.caseId).sort()).toEqual(["ADD-2", "ADD-3", "SMK-1"]);
      const add2 = entries.find((e) => e.caseId === "ADD-2")!;
      expect(add2.files.sort()).toEqual(["add2-1-rent-roll.png", "add2-2-column-mapping.png"]);
      expect(add2.dir).toBe("/ws/.kg-e2e-shots/ADD-2");
    });
  });

  it("when a case exists in both dirs, the primary dir wins (no silent merge of file lists)", async () => {
    const tree: Record<string, string[]> = {
      "/ws/.kg-e2e-shots": ["ADD-2"],
      "/ws/.kg-e2e-shots/ADD-2": ["fresh.png"],
      "/fe/e2e/.step-shots": ["ADD-2"],
      "/fe/e2e/.step-shots/ADD-2": ["stale.png"],
    };
    const entries = await scanLocalShotDirs(fs(tree), { primary: "/ws/.kg-e2e-shots", fallback: "/fe/e2e/.step-shots" });
    expect(entries.filter((e) => e.caseId === "ADD-2")).toHaveLength(1);
    expect(entries.find((e) => e.caseId === "ADD-2")?.files).toEqual(["fresh.png"]);
  });

  it("returns an empty list when neither dir exists", async () => {
    const entries = await scanLocalShotDirs(fs({}), { primary: "/nope", fallback: "/also-nope" });
    expect(entries).toEqual([]);
  });
});

// ── planUpload: map local case dirs -> runnable case ids from the graph, honoring --case scope ──
describe("planUpload", () => {
  const local: ShotDirEntry[] = [
    { caseId: "ADD-2", dir: "/shots/ADD-2", files: ["add2-1.png", "add2-2.png"] },
    { caseId: "ADD-3", dir: "/shots/ADD-3", files: ["add3-1.png"] },
    { caseId: "ORPHAN-9", dir: "/shots/ORPHAN-9", files: ["x.png"] },
  ];
  const graphCaseIds = new Set(["add-2", "add-3", "smk-1"]); // graph stores bare ids lowercase

  it("only plans cases that exist as runnable e2e nodes in the graph (drops orphaned shot dirs)", () => {
    const plan = planUpload(local, graphCaseIds);
    expect(plan.map((p) => p.caseId).sort()).toEqual(["ADD-2", "ADD-3"]);
    expect(plan.find((p) => p.caseId === "ORPHAN-9")).toBeUndefined();
  });

  it("--case scope narrows the plan to exactly the requested case ids (case-insensitive)", () => {
    const plan = planUpload(local, graphCaseIds, ["add-2"]);
    expect(plan.map((p) => p.caseId)).toEqual(["ADD-2"]);
  });

  it("numbers files deterministically (01-, 02-, … by sorted filename) for the kg-cases/<case>/<sha>/NN-<name>.png layout", () => {
    const plan = planUpload(local, graphCaseIds);
    const add2 = plan.find((p) => p.caseId === "ADD-2")!;
    expect(add2.uploads).toEqual([
      { filename: "add2-1.png", remoteName: "01-add2-1.png" },
      { filename: "add2-2.png", remoteName: "02-add2-2.png" },
    ]);
  });
});

// ── pruneShaSet: keep newest 3 SHAs per case ──
describe("pruneShaSet", () => {
  it("keeps the newest 3 SHA dirs (by given recency order) and marks the rest for deletion", () => {
    // caller passes SHAs already ordered newest-first (e.g. from `gh api` dir listing + commit dates)
    const result = pruneShaSet(["sha5", "sha4", "sha3", "sha2", "sha1"]);
    expect(result.keep).toEqual(["sha5", "sha4", "sha3"]);
    expect(result.prune).toEqual(["sha2", "sha1"]);
  });

  it("keeps everything (prunes nothing) when there are 3 or fewer SHAs", () => {
    expect(pruneShaSet(["sha2", "sha1"])).toEqual({ keep: ["sha2", "sha1"], prune: [] });
  });

  it("the new SHA about to be uploaded is always kept, even if it would push an old one out", () => {
    const result = pruneShaSet(["sha3", "sha2", "sha1"], "sha-new");
    expect(result.keep).toEqual(["sha-new", "sha3", "sha2"]);
    expect(result.prune).toEqual(["sha1"]);
  });
});

// ── buildEvidenceIndex: contract 3 shape ──
describe("buildEvidenceIndex", () => {
  // Contract 3 (spec §2) keys `shots` by the ORIGINAL bare filename (e.g. "add3-1-rent-roll.png",
  // matching a case's `steps[].screenshot` exactly) — the spec's own JSON example shows this:
  // `"shots": { "add3-1-rent-roll.png": ".../01-add3-1-rent-roll.png" }`. The remote's ordinal
  // prefix ("01-") is a GitHub-folder-ordering detail that belongs ONLY in the URL path segment,
  // never in the index key — the viewer's shotSrcCandidates() does an exact `n.evidence[filename]`
  // lookup against the step's bare screenshot name, so a remoteName-keyed index silently never
  // resolves for ANY case (regression: found live during integration verification — every step in
  // every evidenced case fell through to the "not available" placeholder even with valid URLs).
  it("builds the frozen contract-3 index shape, keyed by the bare filename (not the remote-numbered name)", () => {
    const idx = buildEvidenceIndex(
      "acme-org/svc_frontend",
      [
        {
          caseId: "ADD-3",
          sha: "abc1234",
          shots: [{ filename: "add3-1-rent-roll.png", remoteName: "01-add3-1-rent-roll.png" }],
        },
      ],
      "2026-07-05T00:00:00.000Z",
    );
    expect(idx).toEqual({
      branch: "e2e-evidence",
      updatedAt: "2026-07-05T00:00:00.000Z",
      cases: {
        "add-3": {
          sha: "abc1234",
          shots: {
            "add3-1-rent-roll.png": "https://raw.githubusercontent.com/acme-org/svc_frontend/e2e-evidence/kg-cases/add-3/abc1234/01-add3-1-rent-roll.png",
          },
        },
      },
    });
  });

  it("lower-cases the case id key (graph bare-id convention) while the URL path segment uses the same lower-cased id", () => {
    const idx = buildEvidenceIndex("org/repo", [{ caseId: "SMK-1", sha: "z", shots: [{ filename: "x.png", remoteName: "01-x.png" }] }], "T");
    expect(Object.keys(idx.cases)).toEqual(["smk-1"]);
    expect(idx.cases["smk-1"].shots["x.png"]).toContain("/kg-cases/smk-1/z/01-x.png");
  });
});

// ── runUpload: orchestration behind an injected gh wrapper (no real network calls in tests) ──
describe("runUpload", () => {
  function makeGh(existingShas: Record<string, string[]> = {}): GhLike & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      listCaseShas: async (caseId: string) => existingShas[caseId] ?? [],
      putFile: async (remotePath: string, _content: Buffer) => {
        calls.push(`PUT ${remotePath}`);
      },
      deleteDir: async (remotePath: string) => {
        calls.push(`DELETE ${remotePath}`);
      },
    };
  }
  const fs: FsLike & { readFile: NonNullable<FsLike["readFile"]> } = {
    listDir: async () => [],
    readFile: async (p: string) => Buffer.from(`content of ${p}`),
  };

  it("dry-run performs no gh calls and returns the planned index without mutating remote state", async () => {
    const gh = makeGh();
    const local: ShotDirEntry[] = [{ caseId: "ADD-3", dir: "/shots/ADD-3", files: ["add3-1.png"] }];
    const result = await runUpload({
      repo: "acme-org/svc_frontend",
      local,
      graphCaseIds: new Set(["add-3"]),
      sha: "abc1234",
      dryRun: true,
      fs,
      gh,
      now: "2026-07-05T00:00:00.000Z",
    });
    expect(gh.calls).toEqual([]);
    expect(result.index.cases["add-3"].sha).toBe("abc1234");
    expect(result.uploadedCount).toBe(1);
  });

  it("real run uploads each file via gh api contents PUT and prunes SHAs older than the newest 3", async () => {
    const gh = makeGh({ "add-3": ["sha3", "sha2", "sha1"] }); // newest-first; 3 existing + 1 new = prune oldest
    const local: ShotDirEntry[] = [{ caseId: "ADD-3", dir: "/shots/ADD-3", files: ["add3-1.png"] }];
    const result = await runUpload({
      repo: "acme-org/svc_frontend",
      local,
      graphCaseIds: new Set(["add-3"]),
      sha: "shaNEW",
      dryRun: false,
      fs,
      gh,
      now: "2026-07-05T00:00:00.000Z",
    });
    expect(gh.calls).toContain("PUT kg-cases/add-3/shaNEW/01-add3-1.png");
    expect(gh.calls).toContain("DELETE kg-cases/add-3/sha1");
    expect(gh.calls).not.toContain("DELETE kg-cases/add-3/sha2");
    expect(result.uploadedCount).toBe(1);
  });

  it("--case scope only uploads the requested case(s)", async () => {
    const gh = makeGh();
    const local: ShotDirEntry[] = [
      { caseId: "ADD-2", dir: "/shots/ADD-2", files: ["a.png"] },
      { caseId: "ADD-3", dir: "/shots/ADD-3", files: ["b.png"] },
    ];
    const result = await runUpload({
      repo: "org/repo",
      local,
      graphCaseIds: new Set(["add-2", "add-3"]),
      sha: "x",
      dryRun: false,
      caseFilter: ["add-3"],
      fs,
      gh,
      now: "T",
    });
    expect(Object.keys(result.index.cases)).toEqual(["add-3"]);
    expect(gh.calls.some((c) => c.includes("add-2"))).toBe(false);
  });

  it("indexes shots by the bare local filename end-to-end, not the remote 01-/02-numbered name (viewer lookup contract)", async () => {
    const gh = makeGh();
    const local: ShotDirEntry[] = [{ caseId: "ADD-3", dir: "/shots/ADD-3", files: ["add3-1-rent-roll.png"] }];
    const result = await runUpload({
      repo: "org/repo",
      local,
      graphCaseIds: new Set(["add-3"]),
      sha: "abc1234",
      dryRun: false,
      fs,
      gh,
      now: "T",
    });
    // The graph's shotSrcCandidates() looks up n.evidence[s.screenshot] with the BARE name a
    // case's steps[] carries — the index must be keyed that way, with the remote 01- prefix
    // living only in the URL's path segment.
    expect(Object.keys(result.index.cases["add-3"].shots)).toEqual(["add3-1-rent-roll.png"]);
    expect(result.index.cases["add-3"].shots["add3-1-rent-roll.png"]).toContain("/01-add3-1-rent-roll.png");
  });
});
