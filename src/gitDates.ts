// gitDates.ts — derive file created/updated dates from git history for file-backed knowledge nodes.
//
// The workspace root is the `main` git repo; `dojostack_backend/` and `dojostack_frontend/` are
// SEPARATE nested repos. So dating is grouped by owning repo (repoOf) and each group is dated
// against that repo's root, with the repo prefix stripped so git sees repo-relative pathspecs.
// Results are remapped back to the original input paths.
//
// Pathspecs are passed on argv (`git log ... -- <path...>`): the older stdin form
// (`--pathspec-from-file=- --pathspec-file-nul`) is NOT supported by `git log` on git 2.32, where
// it errors `fatal: unrecognized argument` → every process exited non-zero → no dates at all. To
// keep the Windows argv-length safety that stdin gave us, each repo's paths are CHUNKED
// (CHUNK_SIZE per git invocation) and the chunks' stdout concatenated before parsing — correct
// because each chunk covers a disjoint path set. git absence / a non-git dir / a git failure is
// tolerated per repo — that group simply contributes nothing and the build proceeds.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { repoOf } from "./repo";

type Repo = "main" | "backend" | "frontend";

/** How each repo maps to a subdirectory of the workspace root and to the path prefix it owns. */
const REPO_SUBDIR: Record<Repo, string> = { main: "", backend: "dojostack_backend", frontend: "dojostack_frontend" };
const REPO_PREFIX: Record<Repo, string> = { main: "", backend: "dojostack_backend/", frontend: "dojostack_frontend/" };

/** Repo-relative pathspecs per `git log` invocation. Bounds argv length on large repos (Windows). */
const CHUNK_SIZE = 256;

/**
 * Injectable git runner: run `git log` for a repo over the given repo-relative paths and return the
 * concatenated stdout, or `null` if git failed / is unavailable / the dir is not a repo. MUST NOT
 * reject on a git failure — return null so the caller can skip that group. Injected in tests so the
 * grouping/remap logic is exercised without touching real git history.
 */
export type GitRunner = (cwd: string, relPaths: string[]) => Promise<string | null>;

/**
 * Parse the output of `git log --format=%x00%aI --name-only` into per-file dates.
 *
 * Layout (newest→oldest): a NUL-prefixed line carrying the ISO author date, then the commit's
 * changed file paths one per line. For each path the FIRST date seen is `updated` (newest) and the
 * LAST date seen is `created` (oldest). Each date is normalized to its first 10 chars (YYYY-MM-DD).
 * Blank lines, malformed date headers, and path lines with no date context are ignored. PURE.
 */
export function parseGitLog(output: string): Map<string, { created: string; updated: string }> {
  const dates = new Map<string, { created: string; updated: string }>();
  let current: string | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("\x00")) {
      const rest = line.slice(1).trim();
      // A well-formed header starts with an ISO date; anything else is left as no-op (context
      // unchanged) rather than corrupting the current date.
      if (/^\d{4}-\d{2}-\d{2}/.test(rest)) current = rest.slice(0, 10);
      continue;
    }
    const path = line.trim();
    if (!path || !current) continue; // blank line, or a path before any date header
    const existing = dates.get(path);
    if (!existing) dates.set(path, { created: current, updated: current });
    else existing.created = current; // newest→oldest ⇒ keep pushing `created` back to the oldest date
  }
  return dates;
}

/** Spawn one real `git log` over a single chunk of repo-relative paths (argv). Null on any failure. */
function runGitLogChunk(cwd: string, relPaths: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let child;
    try {
      child = spawn(
        "git",
        ["-C", cwd, "log", "--format=%x00%aI", "--name-only", "--", ...relPaths],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      done(null); // e.g. git binary missing (synchronous spawn failure)
      return;
    }
    let out = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d) => {
      out += d;
    });
    child.on("error", () => done(null)); // missing binary / permission (async spawn failure)
    child.on("close", (code) => done(code === 0 ? out : null));
  });
}

/**
 * Default runner: date a repo's paths with real `git log`, chunked to bound argv length. Any chunk
 * failure (non-zero exit / missing binary / non-git dir) fails the whole group → null, so a broken
 * or absent git is a clean no-op rather than partial/garbage dates.
 */
async function defaultGitRunner(cwd: string, relPaths: string[]): Promise<string | null> {
  let out = "";
  for (let i = 0; i < relPaths.length; i += CHUNK_SIZE) {
    const stdout = await runGitLogChunk(cwd, relPaths.slice(i, i + CHUNK_SIZE));
    if (stdout == null) return null;
    out += stdout;
  }
  return out;
}

/**
 * Resolve first-commit (`created`) / last-commit (`updated`) dates for `paths`, grouping by owning
 * repo and invoking the runner ONCE per repo (the default runner chunks that into ≤CHUNK_SIZE-path
 * git spawns). Keys in the returned map are the ORIGINAL input paths. A per-repo git failure is
 * tolerated (that group contributes nothing). No paths → empty map, no git spawn.
 */
export async function docDates(
  repoRoot: string,
  paths: string[],
  runner: GitRunner = defaultGitRunner,
): Promise<Map<string, { created?: string; updated?: string }>> {
  const out = new Map<string, { created?: string; updated?: string }>();

  const groups = new Map<Repo, string[]>();
  for (const p of paths) {
    const repo = repoOf(p);
    (groups.get(repo) ?? groups.set(repo, []).get(repo)!).push(p);
  }

  for (const [repo, groupPaths] of groups) {
    const prefix = REPO_PREFIX[repo];
    const cwd = REPO_SUBDIR[repo] ? join(repoRoot, REPO_SUBDIR[repo]) : repoRoot;
    const relPaths = groupPaths.map((p) => p.slice(prefix.length));

    let stdout: string | null;
    try {
      stdout = await runner(cwd, relPaths);
    } catch {
      stdout = null; // an injected/real runner that throws is treated as git-unavailable → skip
    }
    if (stdout == null) continue;

    for (const [rel, d] of parseGitLog(stdout)) out.set(prefix + rel, d);
  }

  return out;
}
