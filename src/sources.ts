// sources.ts — the pin lockfile for the cross-repo graph build.
//
// WHY THIS EXISTS. In a multi-repo workspace the committed graph is a derived artifact of EVERY repo,
// and it is irreducibly cross-repo — hundreds of edges cross a repo boundary, so a partial checkout
// severs them and fabricates uncovered/broken-link issues. But the repos sit on independent branches
// and the graph pinned NO source commits, so
// "does the committed graph match a rebuild from source?" had no answer any CI job could compute:
// checking out the siblings at their default branch yields a different graph. That is why the gate
// shipped as `npm run check || echo` (report-only) and why nothing has enforced it since.
//
// Pinning splits that one unanswerable question into two answerable ones — exactly the lockfile
// pattern (`npm ci` verifies the lock is internally consistent; Dependabot separately reports it is
// behind):
//   1. Is the graph a correct build of its PINNED inputs?  -> reproducible, blocking in CI.
//   2. Are the pins CURRENT with the siblings?             -> a separate, non-blocking signal.
//
// Design note: docs/superpowers/specs/2026-07-16-kg-gate-pinned-sources-design.md
// Requirements:  .github/system-design/KNOWLEDGE_GRAPH_TOOL.md §9 (REQ-KG-GATE-01..06, staged).
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { siblingsOf, subdirOf, type Repos } from "./config";

/** The sibling commits a graph was built from, keyed by repo name. The ROOT repo's own sha is the
 *  PR's — CI already has it — so it is never pinned here. A single-repo project pins nothing, which
 *  is not a defect: it simply has no sibling that could drift. */
export type Sources = Record<string, string>;

/** One sibling's observed state: its HEAD, and whether CI could actually fetch that commit. */
export type SourcePin = { sha: string; onOrigin: boolean };

/** What `readSources` observed. FACTS, not a verdict — see the policy split on `readSources`. */
export type SourcesInfo = Record<string, SourcePin>;

/**
 * Injectable git runner: run `git` in `cwd` with `args` and return stdout, or `null` if git failed /
 * is unavailable / the dir is not a repo. MUST NOT reject — return null so callers decide. Injected
 * in tests so the pin logic is exercised without real repos. Mirrors gitDates.ts's GitRunner.
 */
export type GitCmd = (cwd: string, args: string[]) => Promise<string | null>;

/** The repos this lockfile pins: every non-root repo, in config order — which is the report order and
 *  the serialized key order. Config owns this; sources.ts used to keep its own copy (§10.9). */
const siblingNames = (repos: Repos): string[] => siblingsOf(repos).map((r) => r.name);

const SHA_RE = /^[0-9a-f]{40}$/;

/** Short form for humans; the lockfile always stores the full sha. */
const short = (sha: string) => sha.slice(0, 9);

/**
 * PURE. Extract a full sha from `git rev-parse HEAD` output. Anything that is not exactly 40 hex
 * chars (an error string, an abbreviated sha, empty, a git failure) is `null` — a half-read sha must
 * never be stamped as a pin.
 */
export function parseSha(out: string | null): string | null {
  const s = (out ?? "").trim();
  return SHA_RE.test(s) ? s : null;
}

/**
 * PURE. Is the commit reachable from a remote branch, per `git branch -r --contains <sha>` output?
 * Any non-empty listing means yes. Empty means local-only. `null` (git failed) is treated as NOT
 * pushed: failing closed here costs one retry, whereas failing open stamps a pin CI can never fetch.
 */
export function isOnOrigin(out: string | null): boolean {
  return (out ?? "").trim().length > 0;
}

/** Spawn one real `git` and resolve stdout, or null on any failure. Never rejects. */
function runGit(cwd: string, args: string[]): Promise<string | null> {
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
      child = spawn("git", ["-C", cwd, ...args], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      done(null); // git binary missing (synchronous spawn failure)
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
 * Observe each sibling's HEAD and whether it is fetchable. Reports FACTS; it applies no policy.
 *
 * THE POLICY SPLIT (and why it is not "refuse to stamp"). An unpushed sibling HEAD is the normal
 * state of feature-branch work — a build that hard-failed on it would break the inner loop every
 * day. The invariant that actually matters is narrower: never *commit* a lockfile CI cannot
 * resolve. So this returns observations, `unfetchablePins` states the rule once, and the two
 * callers apply it at their own altitude — `build` warns and proceeds, `check` blocks. That mirrors
 * the tool's standing split, recorded in PRD §7: "`sync` never blocking regardless of ratchet
 * state"; `check` is the gate.
 *
 * Throws ONLY when a sha cannot be read at all — that is a broken workspace, not a policy call.
 */
export async function readSources(repoRoot: string, repos: Repos, git: GitCmd = runGit): Promise<SourcesInfo> {
  const out: SourcesInfo = {};
  for (const name of siblingNames(repos)) {
    const cwd = join(repoRoot, subdirOf(name, repos));
    const sha = parseSha(await git(cwd, ["rev-parse", "HEAD"]));
    if (!sha) throw new Error(`kg: cannot read ${name} HEAD in ${cwd} — is it a git checkout?`);
    out[name] = { sha, onOrigin: isOnOrigin(await git(cwd, ["branch", "-r", "--contains", sha])) };
  }
  return out;
}

/** PURE. Strip observations down to the shas the lockfile stores. */
export function toSources(info: SourcesInfo): Sources {
  return Object.fromEntries(Object.entries(info).map(([name, pin]) => [name, pin.sha]));
}

/**
 * PURE. REQ-KG-GATE-01/04. Which pins could CI never fetch? One shared rule, so `build`'s warning
 * and `check`'s failure can never disagree about what "unfetchable" means. Names the repo and the
 * fix, because the fix is genuinely one push and the message is the only place that is obvious.
 */
export function unfetchablePins(info: SourcesInfo): string[] {
  const bad: string[] = [];
  for (const name of Object.keys(info))
    if (!info[name].onOrigin)
      bad.push(
        `${name} HEAD ${short(info[name].sha)} is not on origin, so CI could never fetch it — ` +
          `push ${name}, then rebuild`,
      );
  return bad;
}

/** The committed lockfile's name — a sibling of the graph, never a field inside it (design §5.1). */
export const SOURCES_FILE = "knowledge-graph.sources.json";

/**
 * PURE. Serialize the lockfile. Key order is fixed by CONFIG (not by the caller's object literal) and
 * the file ends in a newline, because it is committed: an unstable serialization would produce a
 * phantom diff on every rebuild and teach people to ignore the file.
 */
export function serializeSources(s: Sources, repos: Repos): string {
  const ordered: Sources = {};
  for (const name of siblingNames(repos)) ordered[name] = s[name];
  return JSON.stringify(ordered, null, 2) + "\n";
}

/**
 * PURE. Read a committed lockfile, or `null` if it is absent/garbage/incomplete. Never throws and
 * never returns a partial pin: half a lockfile would let `check` compare a rebuild against a fiction
 * and pass. "Unusable" and "missing" collapse to the same answer on purpose — both mean the caller
 * must refuse rather than guess.
 */
export function parsePinned(json: string, repos: Repos): Sources | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const out: Sources = {};
  for (const name of siblingNames(repos)) {
    const sha = parseSha((raw as Record<string, unknown>)[name] as string | null);
    if (!sha) return null;
    out[name] = sha;
  }
  return out;
}

/**
 * PURE. REQ-KG-GATE-02: the entire `check --pinned` verdict, given the raw lockfile text and the
 * observed checkout.
 *
 * Deliberately takes the RAW text rather than a parsed lockfile, so `check.ts`'s un-testable `isMain`
 * block shrinks to "read a file, print, exit" and every branch of the decision is covered here. That
 * is the whole lesson of REQ-KG-04: its `covers:` pointed at a test proving `ratchetFailures()`
 * *returns* failures while nothing proved the pipeline *acted* on them, so the requirement was false
 * for months. Untestable wiring is where these gates go to die — so there is as little of it as
 * possible.
 *
 * A missing and a malformed lockfile give the same verdict on purpose: both mean "no pin I can
 * trust", and guessing at half a pin would let a rebuild be compared against a fiction and pass.
 */
export function pinnedGateDecision(
  lockfileText: string | null,
  actual: Sources,
  repos: Repos,
): { ok: boolean; messages: string[] } {
  // A single-repo project has no sibling that could drift, so there is nothing a lockfile could
  // assert. Demanding one would fail the gate on a project that is correct by construction.
  if (siblingNames(repos).length === 0)
    return { ok: true, messages: ["kg: single-repo project — no sibling sources to pin ✓"] };
  const pinned = lockfileText === null ? null : parsePinned(lockfileText, repos);
  if (!pinned)
    return {
      ok: false,
      messages: [
        `kg: no usable ${SOURCES_FILE} — cannot verify the graph reproduces from its pinned sources.`,
        `    Run \`npm run build\` and commit ${SOURCES_FILE} alongside the graph.`,
      ],
    };
  const drift = sourcesMatch(pinned, actual, repos);
  if (drift.length)
    return {
      ok: false,
      messages: [
        `kg: the checkout is not at the pinned sources, so a rebuild here would not reproduce the committed graph:`,
        ...drift.map((d) => `    ${d}`),
        `    Check out the pinned commits, or run \`npm run build\` to re-pin and commit the result.`,
      ],
    };
  const at = siblingNames(repos).map((n) => `${n}@${short(pinned[n])}`).join(" ");
  return { ok: true, messages: [`kg: sources match the pins ✓ (${at})`] };
}

/**
 * REQ-KG-GATE-01. Observe the siblings, warn about any pin CI could not fetch, and write the
 * lockfile beside the graph. Returns the pins it stamped.
 *
 * Called from EVERY path that writes the graph (`build` and `sync` both do). A graph written without
 * a matching lockfile would itself be a drift source — the two artifacts would disagree about which
 * inputs produced them — which would be an unfortunate thing to build into the fix for drift.
 * Warns and proceeds: the block lives in `check` (REQ-KG-GATE-04), per §7's split.
 */
export async function stampSources(repoRoot: string, outDir: string, repos: Repos, git: GitCmd = runGit): Promise<Sources> {
  const info = await readSources(repoRoot, repos, git);
  for (const w of unfetchablePins(info)) console.warn(`kg: ⚠ ${w}`);
  const pins = toSources(info);
  await writeFile(join(outDir, SOURCES_FILE), serializeSources(pins, repos));
  return pins;
}

/**
 * PURE. Which siblings' checkouts differ from the pins? Empty means the tree sits exactly on the
 * lockfile and a rebuild is reproducible. Reports EVERY drifted repo, not just the first — one
 * message listing both beats two sequential CI runs.
 */
export function sourcesMatch(pinned: Sources, actual: Sources, repos: Repos): string[] {
  const drift: string[] = [];
  for (const name of siblingNames(repos))
    if (pinned[name] !== actual[name])
      drift.push(`${name}: pinned ${short(pinned[name])}, checkout ${short(actual[name])}`);
  return drift;
}
