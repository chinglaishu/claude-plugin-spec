import { pathToFileURL } from "node:url";

// src/shotsUpload.ts — evidence-branch uploader (spec §5 item 2).
//
// Pure logic (scanning, planning, pruning, index-building) is exported and unit-tested with an
// injected FsLike/GhLike so the test suite never touches the real filesystem or `gh`. The CLI
// entrypoint at the bottom wires real `node:fs` + a thin `gh api` exec wrapper and is NOT covered
// by unit tests (it's a few lines of glue — the proven pr-evidence upload pattern: gh api contents
// base64 PUT with sha when replacing, verified via `gh api ...?ref=`, never anon curl).

// Every gh/git subprocess call below is capped by this timeout so a hung `gh` process (auth
// prompt, stalled network) or a wedged `git` can never block sync:results / shots:upload
// indefinitely — `execFile`'s own `timeout` option SIGTERMs the child once exceeded, and
// execFile's returned promise then rejects (caller already wraps each call in try/catch or
// the outer script's warn-loudly-never-fail policy, per spec §5 item 3). Env-overridable
// for a slow CI runner or a deliberately-slow test double; falls back to the 30s default on
// anything non-numeric or non-positive rather than silently disabling the timeout.
export function subprocessTimeoutMs(env: Record<string, string | undefined>): number {
  const raw = env.KG_SHOTS_SUBPROCESS_TIMEOUT_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

export interface ShotDirEntry { caseId: string; dir: string; files: string[] }

export interface FsLike {
  listDir(dir: string): Promise<string[]>;
  readFile?(path: string): Promise<Buffer>;
}

export interface GhLike {
  /** List existing SHA-dir names under kg-cases/<caseId>/ on the evidence branch, newest first. */
  listCaseShas(caseId: string): Promise<string[]>;
  /** PUT (create/replace) a file's content at a repo-relative path on the evidence branch. */
  putFile(remotePath: string, content: Buffer): Promise<void>;
  /** Delete an entire SHA dir (and its contents) on the evidence branch. */
  deleteDir(remotePath: string): Promise<void>;
}

const bareLower = (id: string) => id.toLowerCase();

/**
 * Scan both local shot directories (E2E_SHOTS_DIR default, falling back to
 * <e2eDir>/.step-shots — same fallback order as the serve.ts `/shots/` route,
 * contract 2) and merge into one case-dir list. When a case id exists under both roots, the
 * primary (E2E_SHOTS_DIR) wins outright — file lists are never silently merged across roots,
 * so a stale fallback copy can't blend with a fresher primary one.
 */
export async function scanLocalShotDirs(fs: FsLike, dirs: { primary: string; fallback: string }): Promise<ShotDirEntry[]> {
  const out = new Map<string, ShotDirEntry>();
  for (const root of [dirs.fallback, dirs.primary]) {
    // fallback first, primary second, so primary's Map.set() wins on a caseId collision
    const caseDirs = await fs.listDir(root);
    for (const caseId of caseDirs) {
      const dir = `${root}/${caseId}`;
      const files = await fs.listDir(dir);
      if (files.length) out.set(caseId, { caseId, dir, files });
    }
  }
  return [...out.values()].sort((a, b) => (a.caseId < b.caseId ? -1 : 1));
}

export interface CaseUploadPlan { caseId: string; dir: string; uploads: { filename: string; remoteName: string }[] }

/**
 * Map scanned local case dirs -> runnable case ids known to the graph (dropping orphaned shot
 * dirs whose case no longer exists), optionally narrowed by an explicit `--case` scope.
 * Files are numbered `01-`, `02-`, … by sorted filename for the frozen
 * kg-cases/<caseBareId>/<shortSha>/<NN>-<shotName>.png layout.
 */
export function planUpload(local: ShotDirEntry[], graphCaseIds: Set<string>, caseFilter?: string[]): CaseUploadPlan[] {
  const wanted = caseFilter?.map(bareLower);
  return local
    .filter((e) => graphCaseIds.has(bareLower(e.caseId)))
    .filter((e) => !wanted || wanted.includes(bareLower(e.caseId)))
    .map((e) => ({
      caseId: e.caseId,
      dir: e.dir,
      uploads: [...e.files].sort().map((filename, i) => ({
        filename,
        remoteName: `${String(i + 1).padStart(2, "0")}-${filename}`,
      })),
    }));
}

/** Keep the newest 3 SHA dirs per case; the rest are pruned. `existing` is ordered newest-first. */
export function pruneShaSet(existing: string[], newSha?: string): { keep: string[]; prune: string[] } {
  const ordered = newSha ? [newSha, ...existing.filter((s) => s !== newSha)] : [...existing];
  return { keep: ordered.slice(0, 3), prune: ordered.slice(3) };
}

export interface EvidenceIndexShape {
  branch: string;
  updatedAt: string;
  cases: Record<string, { sha: string; shots: Record<string, string> }>;
}

/**
 * Build the frozen contract-3 index shape (<e2eDir>/kg-evidence-index.json).
 * The `shots` map is keyed by the ORIGINAL bare `filename` (e.g. "add3-1-rent-roll.png") — the
 * exact string a case's `steps[].screenshot` carries — never the remote `01-`/`02`-numbered name.
 * The viewer's shotSrcCandidates() does an exact `n.evidence[filename]` lookup against that bare
 * name (spec §2 contract 3's own JSON example shows this), so a remoteName-keyed index silently
 * never resolves for any case. The ordinal prefix belongs only in the URL's path segment, which
 * must still point at the real uploaded (remote-numbered) object.
 */
export function buildEvidenceIndex(
  repo: string,
  uploaded: { caseId: string; sha: string; shots: { filename: string; remoteName: string }[] }[],
  updatedAt: string,
  branch = "e2e-evidence",
): EvidenceIndexShape {
  const cases: EvidenceIndexShape["cases"] = {};
  for (const u of uploaded) {
    const caseSlug = bareLower(u.caseId);
    const shots: Record<string, string> = {};
    for (const s of u.shots) {
      shots[s.filename] = `https://raw.githubusercontent.com/${repo}/${branch}/kg-cases/${caseSlug}/${u.sha}/${s.remoteName}`;
    }
    cases[caseSlug] = { sha: u.sha, shots };
  }
  return { branch, updatedAt, cases };
}

export interface RunUploadOptions {
  repo: string;                 // "owner/repo"
  local: ShotDirEntry[];
  graphCaseIds: Set<string>;
  sha: string;                   // short commit sha for this upload
  dryRun: boolean;
  caseFilter?: string[];
  fs: FsLike & { readFile: NonNullable<FsLike["readFile"]> };
  gh: GhLike;
  now: string;                   // ISO timestamp for the index's updatedAt
}

export interface RunUploadResult { index: EvidenceIndexShape; uploadedCount: number }

/**
 * Orchestrate a full upload: plan -> (real run) put files + prune old SHAs -> build the index.
 * Dry-run skips every gh call but still returns the index that WOULD be produced, so `--dry-run`
 * is a faithful preview. All gh interaction goes through the injected `GhLike` — the CLI wires a
 * thin wrapper around `gh api repos/{owner}/{repo}/contents/...` (base64 PUT, sha on replace).
 */
export async function runUpload(opts: RunUploadOptions): Promise<RunUploadResult> {
  const plan = planUpload(opts.local, opts.graphCaseIds, opts.caseFilter);
  const uploaded: { caseId: string; sha: string; shots: { filename: string; remoteName: string }[] }[] = [];

  for (const c of plan) {
    if (!opts.dryRun) {
      for (const u of c.uploads) {
        const content = await opts.fs.readFile(`${c.dir}/${u.filename}`);
        await opts.gh.putFile(`kg-cases/${bareLower(c.caseId)}/${opts.sha}/${u.remoteName}`, content);
      }
      const existing = await opts.gh.listCaseShas(bareLower(c.caseId));
      const { prune } = pruneShaSet(existing, opts.sha);
      for (const sha of prune) await opts.gh.deleteDir(`kg-cases/${bareLower(c.caseId)}/${sha}`);
    }
    uploaded.push({ caseId: c.caseId, sha: opts.sha, shots: c.uploads.map((u) => ({ filename: u.filename, remoteName: u.remoteName })) });
  }

  return { index: buildEvidenceIndex(opts.repo, uploaded, opts.now), uploadedCount: uploaded.length };
}

// ── CLI entrypoint (real fs + real `gh api`) — glue only, not unit-tested; the logic above is. ──
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const { readdir, readFile: nodeReadFile, writeFile, unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { pathToFileURL: p2f } = await import("node:url");
  const { loadConfig, e2ePath, repoOf, subdirOf } = await import("./config");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { tmpdir } = await import("node:os");
  const { randomUUID } = await import("node:crypto");
  const execFileAsync = promisify(execFile);
  const SUBPROCESS_TIMEOUT_MS = subprocessTimeoutMs(process.env);

  // `gh api --input <file>` needs a real file (no stdin-JSON shorthand for base64 content this
  // large) — write it to the OS temp dir and always remove it afterwards, so a `gh` call never
  // leaves a stray body file sitting in the repo.
  const withTempBodyFile = async <T>(body: unknown, fn: (path: string) => Promise<T>): Promise<T> => {
    const path = join(tmpdir(), `kg-gh-body-${randomUUID()}.json`);
    await writeFile(path, JSON.stringify(body));
    try {
      return await fn(path);
    } finally {
      await unlink(path).catch(() => {});
    }
  };

  const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
  const config = await loadConfig(repoRoot);
  const outDir = join(repoRoot, config.artifactDir);
  // The repo that owns the e2e suite: its git sha stamps the evidence, and its checkout holds the
  // fallback shots. Previously hardcoded to a frontend repo, which is the same directory in a
  // workspace laid out like that one and a coincidence in general.
  const e2eRepoDir = join(repoRoot, subdirOf(repoOf(config.e2eDir, config.repos), config.repos));
  const branch = "e2e-evidence";
  const repo = process.env.KG_EVIDENCE_REPO ?? config.evidenceRepo;
  if (!repo) {
    console.error("kg shots:upload — no evidence repo: set `evidenceRepo` in kg.config.json (or KG_EVIDENCE_REPO)");
    process.exit(1);
  }

  const argOf = (flag: string): string | undefined => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const dryRun = process.argv.includes("--dry-run");
  const caseArg = argOf("--case");
  const caseFilter = caseArg ? caseArg.split(",").map((s) => s.trim()) : undefined;

  const fsAdapter: FsLike & { readFile: NonNullable<FsLike["readFile"]> } = {
    listDir: async (dir: string) => readdir(dir).catch(() => [] as string[]),
    readFile: async (path: string) => nodeReadFile(path),
  };

  // `gh api repos/{owner}/{repo}/contents/...` base64 PUT (with sha when replacing) — the
  // proven pr-evidence pattern. Verify via `gh api ...?ref=e2e-evidence`, never anon curl.
  const ghApi = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync("gh", ["api", ...args], { timeout: SUBPROCESS_TIMEOUT_MS });
    return stdout;
  };
  const ghAdapter: GhLike = {
    listCaseShas: async (caseId: string) => {
      try {
        const out = await ghApi([`repos/${repo}/contents/kg-cases/${caseId}?ref=${branch}`]);
        const entries = JSON.parse(out) as { name: string; type: string }[];
        // Directory listing has no inherent recency order from the API; sort so the SHA that
        // sorts last (most recently created dirs tend to sort after alphabetically-earlier
        // short SHAs less than half the time — so instead we rely on the caller always passing
        // the new SHA in via pruneShaSet, and treat GitHub's returned order as best-effort. A
        // stronger recency source (commit dates) is deferred — see PRD "not building" note.
        return entries.filter((e) => e.type === "dir").map((e) => e.name);
      } catch {
        return [];
      }
    },
    putFile: async (remotePath: string, content: Buffer) => {
      let sha: string | undefined;
      try {
        const out = await ghApi([`repos/${repo}/contents/${remotePath}?ref=${branch}`]);
        sha = (JSON.parse(out) as { sha?: string }).sha;
      } catch {
        sha = undefined;
      }
      const body = { message: `chore(e2e): upload evidence ${remotePath}`, content: content.toString("base64"), branch, ...(sha ? { sha } : {}) };
      await withTempBodyFile(body, (bodyFile) => execFileAsync("gh", ["api", `repos/${repo}/contents/${remotePath}`, "-X", "PUT", "--input", bodyFile], { timeout: SUBPROCESS_TIMEOUT_MS }));
    },
    deleteDir: async (remotePath: string) => {
      // The contents API deletes one file at a time; list then delete each, then the (now
      // empty) tree entry disappears on its own — git has no empty directories.
      try {
        const out = await ghApi([`repos/${repo}/contents/${remotePath}?ref=${branch}`]);
        const entries = JSON.parse(out) as { name: string; sha: string; type: string }[];
        for (const e of entries) {
          if (e.type !== "file") continue;
          const body = { message: `chore(e2e): prune evidence ${remotePath}/${e.name}`, sha: e.sha, branch };
          await withTempBodyFile(body, (bodyFile) => execFileAsync("gh", ["api", `repos/${repo}/contents/${remotePath}/${e.name}`, "-X", "DELETE", "--input", bodyFile], { timeout: SUBPROCESS_TIMEOUT_MS }));
        }
      } catch (e) {
        console.warn(`kg shots:upload — prune skipped for ${remotePath}: ${(e as Error).message}`);
      }
    },
  };

  const graph = JSON.parse(await nodeReadFile(join(outDir, "knowledge-graph.json"), "utf8")) as { nodes: { id: string; type: string; kind?: string }[] };
  const graphCaseIds = new Set(
    graph.nodes.filter((n) => n.type === "test" && n.kind === "e2e").map((n) => { const i = n.id.indexOf(":"); return (i >= 0 ? n.id.slice(i + 1) : n.id).toLowerCase(); }),
  );

  const primary = process.env.E2E_SHOTS_DIR ?? join(repoRoot, config.shotsDir);
  const fallback = join(repoRoot, e2ePath(config, ".step-shots"));
  const local = await scanLocalShotDirs(fsAdapter, { primary, fallback });

  const { stdout: shaOut } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: e2eRepoDir, timeout: SUBPROCESS_TIMEOUT_MS });
  const sha = shaOut.trim() || "unknown";

  const result = await runUpload({ repo, local, graphCaseIds, sha, dryRun, caseFilter, fs: fsAdapter, gh: ghAdapter, now: new Date().toISOString() });

  const totalShots = Object.values(result.index.cases).reduce((n, c) => n + Object.keys(c.shots).length, 0);
  console.log(`kg shots:upload — ${dryRun ? "[dry-run] " : ""}${result.uploadedCount} case(s), ${totalShots} shot(s) @ sha ${sha}${caseFilter ? ` (scoped: ${caseFilter.join(",")})` : ""}`);

  if (!dryRun) {
    const indexPath = join(repoRoot, e2ePath(config, "kg-evidence-index.json"));
    // Full runs replace the index; scoped (--case) runs merge into the existing file so an
    // unrelated case's evidence isn't dropped.
    const existing = caseFilter
      ? await nodeReadFile(indexPath, "utf8").then((s) => JSON.parse(s) as EvidenceIndexShape).catch(() => null)
      : null;
    const merged: EvidenceIndexShape = existing
      ? { ...result.index, cases: { ...existing.cases, ...result.index.cases } }
      : result.index;
    await writeFile(indexPath, JSON.stringify(merged, null, 2) + "\n");
    console.log(`kg shots:upload — wrote ${indexPath}`);
  } else {
    console.log(JSON.stringify(result.index, null, 2));
  }
}
