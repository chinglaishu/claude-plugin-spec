import { pathToFileURL } from "node:url";
import { objectKey, evidenceRef, blobAdapter } from "./blobStore";
import type { Evidence } from "./config";

// src/shotsUpload.ts — evidence uploader (spec §5).
//
// Header amended 2026-07-24: this said "evidence-branch uploader", which stopped being true when the
// blob destination landed. The orchestration below is destination-NEUTRAL — plan, put, prune, index
// is the same sequence for a bucket as for a branch — and only two things vary, both injected:
// `GhLike` (how bytes get there) and `ShotRef` (what the committed index then points at). They are
// chosen together in a single expression at the bottom, because uploading one way and indexing the
// other fails silently: every upload reports ✓ and every screenshot renders "not available".
//
// Pure logic (scanning, planning, pruning, index-building) is exported and unit-tested with an
// injected FsLike/GhLike so the test suite never touches the real filesystem, `gh` or `aws`. The CLI
// entrypoint at the bottom wires real `node:fs` + thin exec wrappers and is NOT covered by unit tests
// (a few lines of glue — for github, the proven pr-evidence upload pattern: gh api contents base64
// PUT with sha when replacing, verified via `gh api ...?ref=`, never anon curl; for blob, `aws s3`,
// whose argv is built and asserted in `blobStore.ts`).

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
  /** The `e2e-evidence` branch, for the github destination. OPTIONAL because it is a fact about that
   *  ONE destination, and a blob-destination index has no branch to name (REQ-KG-05). Provenance
   *  only — nothing reads it; `applyEvidence` folds `cases` alone, which is why the blob index simply
   *  omits it rather than gaining a second, half-set sibling field beside it. */
  branch?: string;
  updatedAt: string;
  cases: Record<string, { sha: string; shots: Record<string, string> }>;
}

/**
 * How a destination ADDRESSES one uploaded object in the committed index — the second half of the
 * `GhLike` seam. `GhLike` says how bytes get there; this says what the index then points at, and the
 * two must be swapped together or the upload lands somewhere the index never names.
 */
export type ShotRef = (caseSlug: string, sha: string, remoteName: string) => string;

/** The evidence branch's raw URL. Public content in a public repo; a private one is read through the
 *  viewer's token tier (`evidenceUrl.ts`). */
export const githubRef = (repo: string, branch = "e2e-evidence"): ShotRef =>
  (caseSlug, sha, remoteName) =>
    `https://raw.githubusercontent.com/${repo}/${branch}/kg-cases/${caseSlug}/${sha}/${remoteName}`;

/** A private bucket's object KEY, addressed through serve.ts's signing route. Never a URL: a signed
 *  one expires long before the committed index does. */
export const blobRef = (evidence: Extract<Evidence, { kind: "blob" }>): ShotRef =>
  (caseSlug, sha, remoteName) => evidenceRef(objectKey(evidence, caseSlug, sha, remoteName));

/**
 * Build the frozen contract-3 index shape (<e2eDir>/kg-evidence-index.json).
 * The `shots` map is keyed by the ORIGINAL bare `filename` (e.g. "add3-1-rent-roll.png") — the
 * exact string a case's `steps[].screenshot` carries — never the remote `01-`/`02`-numbered name.
 * The viewer's shotSrcCandidates() does an exact `n.evidence[filename]` lookup against that bare
 * name (spec §2 contract 3's own JSON example shows this), so a remoteName-keyed index silently
 * never resolves for any case. The ordinal prefix belongs only in the reference's path segment,
 * which must still point at the real uploaded (remote-numbered) object.
 *
 * ONE builder for every destination, deliberately: that bare-filename rule is the one this file has
 * already got wrong once in production, and a second copy of the loop is a second place to get it
 * wrong again. Only the reference format varies, so only the reference format is injected.
 */
export function buildIndex(
  ref: ShotRef,
  uploaded: { caseId: string; sha: string; shots: { filename: string; remoteName: string }[] }[],
  updatedAt: string,
  branch?: string,
): EvidenceIndexShape {
  const cases: EvidenceIndexShape["cases"] = {};
  for (const u of uploaded) {
    const caseSlug = bareLower(u.caseId);
    const shots: Record<string, string> = {};
    for (const s of u.shots) shots[s.filename] = ref(caseSlug, u.sha, s.remoteName);
    cases[caseSlug] = { sha: u.sha, shots };
  }
  return { ...(branch ? { branch } : {}), updatedAt, cases };
}

/** The github destination's index — the shape this file has always written. */
export function buildEvidenceIndex(
  repo: string,
  uploaded: { caseId: string; sha: string; shots: { filename: string; remoteName: string }[] }[],
  updatedAt: string,
  branch = "e2e-evidence",
): EvidenceIndexShape {
  return buildIndex(githubRef(repo, branch), uploaded, updatedAt, branch);
}

export interface RunUploadOptions {
  /** How the committed index addresses what this run uploads — `githubRef` or `blobRef`, matching
   *  the `gh` adapter below. */
  ref: ShotRef;
  /** Provenance stamped into the index; the github destination's branch, absent for a bucket. */
  branch?: string;
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

  return { index: buildIndex(opts.ref, uploaded, opts.now, opts.branch), uploadedCount: uploaded.length };
}

// ── CLI entrypoint (real fs + real `gh api` / `aws s3`) — glue only; the logic above is tested. ──
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
  // Exactly one destination, and the env override is a github repo by definition (REQ-KG-05).
  const evidence = process.env.KG_EVIDENCE_REPO
    ? ({ kind: "github", repo: process.env.KG_EVIDENCE_REPO } as const)
    : config.evidence;

  if (evidence.kind === "local") {
    // Not a failure: local IS a valid declared destination. Shots stay on the device, and there is
    // simply nothing to upload — but say so, rather than exiting silently as if work had happened.
    console.log(`kg shots:upload — evidence destination is the local device; nothing to upload.`);
    console.log(`kg shots:upload — screenshots remain under ${config.shotsDir}. Declare \`evidence\` in kg.config.json to share them across machines.`);
    process.exit(0);
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

  // `aws s3 …`, the blob destination's whole subprocess surface. Credentials are deliberately absent:
  // they resolve from the standard AWS chain at run time, so nothing here can leak a secret and every
  // argv is safe to log verbatim (REQ-KG-05).
  const awsCli = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync("aws", args, { timeout: SUBPROCESS_TIMEOUT_MS });
    return stdout;
  };

  // RAW BYTES — and emphatically NOT `withTempBodyFile` above, which JSON.stringifies its argument
  // for `gh api --input`. Handing a PNG to that one would write `{"0":137,"1":80,…}` to disk and
  // `aws s3 cp` would upload the wrapper as the screenshot, exiting 0 while doing it.
  const withRawTempFile = async <T>(bytes: Buffer, fn: (path: string) => Promise<T>): Promise<T> => {
    const path = join(tmpdir(), `kg-blob-${randomUUID()}.png`);
    await writeFile(path, bytes);
    try {
      return await fn(path);
    } finally {
      await unlink(path).catch(() => {});
    }
  };

  // `gh api repos/{owner}/{repo}/contents/...` base64 PUT (with sha when replacing) — the
  // proven pr-evidence pattern. Verify via `gh api ...?ref=e2e-evidence`, never anon curl.
  const ghApi = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync("gh", ["api", ...args], { timeout: SUBPROCESS_TIMEOUT_MS });
    return stdout;
  };
  const githubAdapter = (repo: string): GhLike => ({
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
  });

  // EXACTLY ONE destination is built. The discriminated union means there is no path on which both
  // an adapter and a mismatched reference format exist — the two are chosen in a single expression
  // precisely because uploading one way and indexing the other is the failure that looks like
  // success: every upload reports ✓ and every screenshot renders as "not available".
  const { gh: ghAdapter, ref, indexBranch, destination } = evidence.kind === "blob"
    ? {
        gh: blobAdapter(evidence, { aws: awsCli, withRawTempFile, warn: (m: string) => console.warn(m) }),
        ref: blobRef(evidence),
        indexBranch: undefined as string | undefined,
        destination: `s3://${evidence.bucket}/${evidence.prefix}`,
      }
    : {
        gh: githubAdapter(evidence.repo),
        ref: githubRef(evidence.repo, branch),
        indexBranch: branch as string | undefined,
        destination: `${evidence.repo}@${branch}`,
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

  const result = await runUpload({ ref, branch: indexBranch, local, graphCaseIds, sha, dryRun, caseFilter, fs: fsAdapter, gh: ghAdapter, now: new Date().toISOString() });

  const totalShots = Object.values(result.index.cases).reduce((n, c) => n + Object.keys(c.shots).length, 0);
  console.log(`kg shots:upload — ${dryRun ? "[dry-run] " : ""}${result.uploadedCount} case(s), ${totalShots} shot(s) @ sha ${sha} → ${destination}${caseFilter ? ` (scoped: ${caseFilter.join(",")})` : ""}`);

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
