// ungovernedBaseline.ts — freeze what is ALREADY ungoverned, so the gate can engage on what comes next.
//
// Founding design §10.3: "existing untouched code stays legal; new ungoverned code fails the build."
// Without this artifact `contextPack` sees no baseline, reads the project as never-governed, and
// grandfathers every path forever — the hook prints a briefing and the gate never engages at all. So
// this is not a convenience: it is the step that turns the ratchet on.
//
// TWO SEMANTICS THAT MUST NOT COLLAPSE (see agentContextCli.ts):
//   absent  → the project has not been governed yet; NEVER halt.
//   empty   → nothing is excused; halt on every ungoverned path.
// The file is therefore always a top-level JSON ARRAY. A `{ paths: [...] }` wrapper would be read as
// a non-array, i.e. as ABSENT — an init that looks successful and silently disables the gate forever.
//
// The ratchet only turns one way. Regenerating a baseline to clear a halt is the one move this
// project never makes, so `create` refuses to overwrite and `prune` can only ever remove.
import fg from "fast-glob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { contextPack } from "./agentContext";
import { artifactPath, IGNORE, type Config } from "./config";
import type { Graph } from "./types";

/** The baseline's filename inside the project's artifact dir. One constant, one reader (the hook). */
export const BASELINE_FILE = "ungoverned-baseline.json";

/** Injectable so the walk can be exercised without a real tree. Returns workspace-relative paths. */
export type PathLister = (repoRoot: string, ignore: string[]) => Promise<string[]>;

/** Every file in the tree, minus the tool's floor and the project's own exclusions. Deliberately not
 *  `git ls-files`: a project without git — or run where git is unavailable — would enumerate nothing
 *  and freeze an EMPTY baseline, which reads as "nothing is excused" and halts the user out of their
 *  own repo. A stray untracked file in the baseline is harmless; that failure is not. */
export const globPaths: PathLister = (repoRoot, ignore) =>
  fg("**/*", { cwd: repoRoot, ignore, dot: true, unique: true, onlyFiles: true, followSymbolicLinks: false });

/**
 * PURE. Which of these paths nothing governs — sorted and deduped, so a re-run over an unchanged
 * tree writes identical bytes.
 *
 * Governance is asked of `contextPack` rather than re-derived here, because there are TWO routes to
 * ownership (a doc's `governs:` and a feature's path globs) and a second opinion about which counts
 * is exactly the contradiction this tool exists to remove. The empty baseline passed in means
 * "nothing is excused", so `halt` reduces cleanly to "is this ungoverned".
 */
export function ungovernedPaths(graph: Graph, config: Config, paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) if (contextPack(graph, config, p, []).halt) out.add(p);
  return [...out].sort();
}

/** PURE. The ratchet: a rewritten baseline is the INTERSECTION of what it already excused and what is
 *  still ungoverned. Paths that became governed fall out; a newly-written ungoverned file can never
 *  enter, so re-running the generator is never a way to clear a halt. */
export function pruneBaseline(existing: string[], stillUngoverned: string[]): string[] {
  const still = new Set(stillUngoverned);
  return [...new Set(existing.filter((p) => still.has(p)))].sort();
}

/** Byte-stable on purpose — the baseline is committed, so a re-run must not churn the diff. */
const serialize = (paths: string[]) => JSON.stringify(paths, null, 2) + "\n";

export interface BaselineResult {
  /** Absolute path written. */
  path: string;
  /** The frozen set, after the write. */
  paths: string[];
  /** How many files the walk saw — 0 means the enumeration broke, not that the project is empty. */
  scanned: number;
  /** Paths a prune removed (they became governed). Always empty on create. */
  dropped: string[];
  created: boolean;
}

/**
 * Write (or prune) the frozen baseline.
 *
 * `create` refuses when one already exists: freezing is a one-time act, and an overwrite is
 * indistinguishable from excusing whatever you just wrote. `prune` re-reads the existing file and can
 * only shrink it.
 */
export async function writeBaseline(opts: {
  repoRoot: string;
  config: Config;
  graph: Graph;
  mode: "create" | "prune";
  lister?: PathLister;
}): Promise<BaselineResult> {
  const { repoRoot, config, graph, mode } = opts;
  const rel = artifactPath(config, BASELINE_FILE);
  const path = join(repoRoot, rel);

  const existingJson = await readFile(path, "utf8").catch(() => null);
  // Pruning nothing intersects against an empty set and writes `[]` — "nothing is excused" — so a
  // mistyped flag on a project that never froze a baseline would halt every edit in it.
  if (mode === "prune" && existingJson === null)
    throw new Error(
      `kg: there is no frozen baseline at ${rel} to prune. Freeze one first (without --prune); ` +
        `pruning what was never frozen would excuse nothing and halt every edit in the project.`,
    );
  if (mode === "create" && existingJson !== null)
    throw new Error(
      `kg: ${rel} already exists and is frozen — refusing to overwrite it. ` +
        `Re-freezing a baseline is how a halt gets cleared without a requirement being written. ` +
        `Use --prune to drop paths that have since become governed; it can never admit a new one.`,
    );

  const scannedPaths = await (opts.lister ?? globPaths)(repoRoot, [...IGNORE, ...config.exclude]);
  if (scannedPaths.length === 0)
    throw new Error(
      `kg: found no files under ${repoRoot} — refusing to freeze an empty baseline. ` +
        `An empty baseline means "nothing is excused", which halts every edit in the project.`,
    );

  const stillUngoverned = ungovernedPaths(graph, config, scannedPaths);
  let paths = stillUngoverned;
  let dropped: string[] = [];
  if (mode === "prune") {
    let existing: string[] = [];
    if (existingJson !== null) {
      const parsed: unknown = JSON.parse(existingJson);
      if (!Array.isArray(parsed))
        throw new Error(`kg: ${rel} is not a JSON array — the briefing hook reads a non-array as no baseline at all.`);
      existing = parsed.map(String);
    }
    paths = pruneBaseline(existing, stillUngoverned);
    dropped = existing.filter((p) => !paths.includes(p));
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(paths));
  return { path, paths, scanned: scannedPaths.length, dropped, created: existingJson === null };
}
