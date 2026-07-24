// config.ts — what the tool knows about the project it measures, and its ONE owner.
//
// WHY THIS EXISTS. The topology used to be re-declared in four places: repo.ts (as a union TYPE, so it
// lived in the type system rather than merely in strings), gitDates.ts and serve.ts (each with their own
// literal maps), and sources.ts — a third independent copy added by the gate work on 2026-07-16. The
// pattern was still actively reproducing, which is why collapsing it is the defect itself and not scope
// creep: shipping config while leaving shadow copies would leave the config true and the code believing
// something else.
//
// Config is THREADED, never a module-level singleton (founding design §10.8). A singleton would be
// near-zero churn but makes the tool stateful, forces test setup/teardown, and lets a parser imported
// standalone silently emit wrong ids. Threading matches the codebase's own instinct — gitDates.ts
// injects a GitRunner rather than reaching for global git, which is exactly why its logic is testable
// without a real repo.
//
// TWO CLASSES OF COUPLING live here, and only the port revealed the second (§10.9): the hardcoded
// project *paths*, and the assumption that the tool lives INSIDE the project it measures (`__dirname`
// walks up to the workspace root, artifacts sit beside the source). `artifactDir` owns the second.
//
// Founding design: docs/superpowers/specs/2026-07-17-founding-design.md (REQ-0, §10.8, §10.9)
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** One repo in the workspace. Exactly one has `subdir: ""` — it owns the workspace root. */
export type Repo = { name: string; subdir: string };

/** The whole topology. A single-repo project is `[{ name: "main", subdir: "" }]` — the degenerate case,
 *  and the one that proves "reusable" is real rather than aspirational (REQ-0). */
export type Repos = Repo[];

/**
 * Which repo a given server starts in, by repo NAME — never by path, so the topology keeps its single
 * owner. `null` means the project has no such server.
 *
 * Open question §12.7 is deliberately still open: the *command* (uvicorn, npm run dev, a venv python)
 * is still the tool's business rather than the project's, and arguably should become an opaque command
 * the project supplies. That is a requirement change and not staff's to make. This settles only WHERE
 * a server runs, which is all REQ-0 forces.
 */
export type Runners = { backend: string | null; frontend: string | null };

/**
 * Where run screenshots are stored (REQ-KG-05). EXACTLY ONE destination, modelled as a discriminated
 * union rather than several independently-settable fields — a config that could carry both a blob URL
 * and a GitHub repo would have no defined winner, and something downstream would silently pick one.
 * That is precisely the contradiction this tool exists to detect, so its own config must not commit it.
 *
 * - `blob`   — a project-supplied S3 bucket, named by COORDINATES ONLY. Nothing reaches us, and no
 *              credential is ever named here: `kg.config.json` is committed, so a signed URL or a key
 *              would enter git history permanently. Credentials resolve at run time from the standard
 *              AWS chain (env vars, `~/.aws`, instance role, or CI's OIDC-minted short-lived creds).
 * - `github` — the tool-managed `e2e-evidence` orphan branch. Shared and versioned with no bucket to
 *              provision, and still nothing leaves the user's own repo.
 * - `local`  — the fallback when nothing is declared. Honest, but note it gives CI and a second
 *              machine NO shared baseline, which is what flow-approval diffs against (§6).
 *
 * Whichever is chosen, evidence is addressed by URL: binaries never enter the committed graph.
 */
export type Evidence =
  | { kind: "blob"; bucket: string; prefix: string; region: string }
  | { kind: "github"; repo: string }
  | { kind: "local" };

/** Keys that would put a secret into a committed file. Refused outright rather than ignored — a
 *  config that silently dropped them would leave the author believing they had been used. */
const CREDENTIAL_KEYS = ["url", "accessKeyId", "secretAccessKey", "sessionToken", "credentials", "token"];

/** Everything the tool must be told about a project. Every path is relative to the workspace root. */
export type Config = {
  /** The repo topology. */
  repos: Repos;
  /** Where the e2e suite lives. The tool owns the layout INSIDE it (`cases/`, `features/`, `cache/`,
   *  `.step-shots/`, `*.spec.ts`) because those are its own conventions; the project owns where it
   *  sits. `""` puts it at the workspace root. */
  e2eDir: string;
  /** Where the tool reads and writes its own artifacts: the graph, the viewer, the ratchet baseline,
   *  the sources lockfile, the digest and the conflict findings. This is the second coupling class —
   *  the tool must be told, not assume it was installed here. */
  artifactDir: string;
  /** Globs for candidate unit-test files. Only a project knows where its source lives, and only those
   *  matching a registered feature's globs are indexed, so this stays bounded. */
  unitTestGlobs: string[];
  /** Sub-trees that are NOT this project's knowledge: committed fixtures, samples, vendored trees.
   *  Subtracted from every glob the knowledge pass runs.
   *
   *  The knowledge globs are repo-wide on purpose — the tool defines where knowledge lives in any
   *  project. That holds until a repo contains a SECOND project as data, whose docs then get indexed
   *  as the host's own. This lives in config and never in the tool, because a hardcoded `fixtures/**`
   *  would re-introduce exactly the project-specific coupling REQ-0 removed. */
  exclude: string[];
  /** Where run screenshots land. Defaults OUTSIDE the repo so evidence never enters git (REQ-KG-05). */
  shotsDir: string;
  /** The single declared destination for run screenshots. Omitted in the file means local device. */
  evidence: Evidence;
  /** Which repo each server runs in. */
  runners: Runners;
};

/** The config file a project puts at its workspace root. Open question §12.6 — the CEO may rename it;
 *  it is one constant and every reference goes through it. */
export const CONFIG_FILE = "kg.config.json";

const bad = (msg: string): never => {
  throw new Error(`kg: invalid config — ${msg}`);
};

/** Trailing separators would double up in every derived path (`e2e//cases/**`). */
const clean = (s: string) => s.replace(/\/+$/, "");

function parseRepos(raw: unknown): Repos {
  if (!Array.isArray(raw) || raw.length === 0) return bad("`repos` must be a non-empty array");

  const out: Repos = [];
  for (const r of raw) {
    const name = (r as Repo)?.name;
    const subdir = (r as Repo)?.subdir;
    if (typeof name !== "string" || !name) return bad("every repo needs a non-empty `name`");
    if (typeof subdir !== "string") return bad(`repo '${name}' needs a \`subdir\` ("" for the root repo)`);
    if (out.some((o) => o.name === name)) return bad(`duplicate repo name '${name}' — ids would collide silently`);
    out.push({ name, subdir: clean(subdir) });
  }

  const roots = out.filter((r) => r.subdir === "");
  if (roots.length === 0) return bad('no root repo — exactly one repo must have `subdir: ""`');
  if (roots.length > 1)
    return bad(`${roots.length} root repos (${roots.map((r) => r.name).join(", ")}) — the root cannot be ambiguous`);

  return out;
}

/**
 * Parse the evidence destination. Absent is the ONLY thing that means local — every other defect
 * throws rather than degrading into it, because a misdeclared destination that silently stored
 * locally would lose shared evidence without ever saying so.
 */
function parseEvidence(raw: unknown): Evidence {
  if (raw === undefined || raw === null) return { kind: "local" };
  if (typeof raw !== "object") return bad("`evidence` must be an object declaring a `kind`");
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind === "local") return { kind: "local" };
  if (kind === "blob") {
    const smuggled = CREDENTIAL_KEYS.filter((k) => o[k] !== undefined);
    if (smuggled.length)
      return bad(
        `\`evidence\` must not carry a credential (${smuggled.join(", ")}) — kg.config.json is committed. ` +
          `Credentials resolve from the standard AWS chain at run time.`,
      );
    const bucket = o.bucket;
    const region = o.region;
    if (typeof bucket !== "string" || !bucket) return bad("`evidence.bucket` is required for kind 'blob'");
    // Without a region the object URL cannot be composed, so evidence would upload and then be
    // unaddressable — worse than refusing, because the loss is silent.
    if (typeof region !== "string" || !region) return bad("`evidence.region` is required for kind 'blob'");
    const prefix = o.prefix === undefined ? "" : o.prefix;
    if (typeof prefix !== "string") return bad("`evidence.prefix` must be a string");
    return { kind: "blob", bucket, prefix: clean(prefix), region };
  }
  if (kind === "github") {
    const repo = o.repo;
    if (typeof repo !== "string" || !repo) return bad("`evidence.repo` is required for kind 'github'");
    return { kind: "github", repo };
  }
  return bad(`\`evidence.kind\` must be 'blob', 'github' or 'local' — got ${JSON.stringify(kind)}`);
}

function parseRunners(raw: unknown, repos: Repos): Runners {
  const pick = (key: keyof Runners): string | null => {
    const v = (raw as Partial<Runners> | undefined)?.[key];
    if (v == null) return null;
    if (typeof v !== "string" || !v) return bad(`\`runners.${key}\` must be a repo name`);
    if (!repos.some((r) => r.name === v))
      return bad(`\`runners.${key}\` names repo '${v}', which the topology does not declare`);
    return v;
  };
  return { backend: pick("backend"), frontend: pick("frontend") };
}

const str = (raw: unknown, key: string, fallback: string): string => {
  const v = (raw as Record<string, unknown>)[key];
  if (v === undefined) return fallback;
  if (typeof v !== "string") return bad(`\`${key}\` must be a string`);
  return clean(v);
};

/**
 * Parse and VALIDATE a project's config. Fails loudly and specifically; never returns a partial one.
 *
 * A half-valid topology silently misfiles every node in the missing repo — the same class of failure as
 * a report-only gate: confidently wrong beats obviously broken, and costs more to discover. So every
 * defect here is a throw, not a default.
 *
 * Paths, unlike the topology, DO default: their failure mode is an empty result rather than a
 * confidently misfiled one, and requiring a project to restate the tool's own conventions would make
 * the common case verbose for no safety.
 */
export function parseConfig(json: string): Config {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return bad("not valid JSON");
  }
  if (!raw || typeof raw !== "object") return bad("must be a JSON object");
  const o = raw as Record<string, unknown>;

  const repos = parseRepos(o.repos);
  const globs = o.unitTestGlobs;
  if (globs !== undefined && (!Array.isArray(globs) || globs.some((g) => typeof g !== "string")))
    return bad("`unitTestGlobs` must be an array of glob strings");
  const excl = o.exclude;
  if (excl !== undefined && (!Array.isArray(excl) || excl.some((g) => typeof g !== "string")))
    return bad("`exclude` must be an array of glob strings");

  return {
    repos,
    e2eDir: str(o, "e2eDir", "e2e"),
    artifactDir: str(o, "artifactDir", "knowledge-graph"),
    unitTestGlobs: (globs as string[] | undefined) ?? [],
    exclude: (excl as string[] | undefined) ?? [],
    shotsDir: str(o, "shotsDir", "../.kg-e2e-shots"),
    evidence: parseEvidence(o.evidence),
    runners: parseRunners(o.runners, repos),
  };
}

/**
 * Read a project's config from its own root. Entrypoints call this ONCE and thread the result down
 * (§10.8).
 *
 * NO SILENT DEFAULT when the file is absent. Falling back to a single-repo topology is the tempting
 * move and the dangerous one: against a multi-repo workspace it namespaces every backend node `main:`
 * instead of `backend:` and emits a complete, confident, wrong graph. Refusing costs one error message.
 */
export async function loadConfig(repoRoot: string): Promise<Config> {
  const path = join(repoRoot, CONFIG_FILE);
  const json = await readFile(path, "utf8").catch(() => null);
  if (json === null)
    return bad(`no ${CONFIG_FILE} at ${repoRoot} — the tool cannot guess a project's repo layout`);
  return parseConfig(json);
}

/**
 * PURE. Which repo owns this path?
 *
 * Matches the LONGEST subdir prefix, so a nested repo wins over a shallower one, and only on a path
 * BOUNDARY — `svc_backend_old/` is not `svc_backend`. The original implementation used a bare
 * `startsWith("<name>/")`, correct only because the trailing slash was baked into the literal; making
 * it configurable makes the boundary rule explicit rather than incidental.
 */
export function repoOf(path: string | undefined, repos: Repos): string {
  const p = path ?? "";
  let best: Repo | undefined;
  for (const r of repos) {
    if (!r.subdir) continue; // the root repo is the fallback, never a prefix match
    if (p === r.subdir || p.startsWith(r.subdir + "/"))
      if (!best || r.subdir.length > best.subdir.length) best = r;
  }
  return best ? best.name : repos.find((r) => r.subdir === "")!.name;
}

/** PURE. Namespace a bare id by its owning repo, e.g. `backend:sd-56`. */
export function nsId(path: string | undefined, bare: string, repos: Repos): string {
  return `${repoOf(path, repos)}:${bare}`;
}

/** PURE. A repo's subdirectory of the workspace root ("" for the root repo). */
export function subdirOf(name: string, repos: Repos): string {
  const r = repos.find((x) => x.name === name);
  if (!r) return bad(`unknown repo '${name}'`);
  return r.subdir;
}

/** PURE. The path prefix a repo owns ("" for the root repo, else `<subdir>/`). */
export function prefixOf(name: string, repos: Repos): string {
  const s = subdirOf(name, repos);
  return s ? s + "/" : "";
}

/** PURE. The non-root repos, in config order — the set the sources lockfile pins, and the order it
 *  reports them in. Empty for a single-repo project, which simply has nothing to pin. */
export function siblingsOf(repos: Repos): Repos {
  return repos.filter((r) => r.subdir !== "");
}

/**
 * PURE. The directory NAMES an absolute path from a test report may be rooted at: the workspace
 * directory itself, plus each nested repo's own directory.
 *
 * Matched by NAME rather than against this machine's absolute paths on purpose — a Playwright report
 * carries the paths of whatever machine ran it (a CI box, a colleague's laptop), so comparing them to
 * local absolutes would strip nothing and leak `C:\Users\<someone>\...` into the graph.
 */
export function repoDirNames(config: Config, repoRoot: string): string[] {
  const workspace = repoRoot.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const nested = siblingsOf(config.repos).map((r) => r.subdir.split("/").pop()!);
  return [workspace, ...nested].filter(Boolean);
}

/** PURE. A workspace-relative path re-expressed relative to its OWN repo. Windows separators are
 *  normalized first, so a path harvested from a Windows checkout matches. */
export function stripRepoPrefix(path: string, repos: Repos): string {
  const p = path.replace(/\\/g, "/");
  return p.slice(prefixOf(repoOf(p, repos), repos).length);
}

/** PURE. Join a path onto the configured e2e dir, without a leading separator when it sits at the
 *  workspace root. */
export function e2ePath(config: Config, ...segments: string[]): string {
  return [config.e2eDir, ...segments].filter(Boolean).join("/");
}

/** PURE. Join a path onto the configured artifact dir. */
export function artifactPath(config: Config, ...segments: string[]): string {
  return [config.artifactDir, ...segments].filter(Boolean).join("/");
}

// The tool's own conventions: where knowledge lives in ANY project, regardless of topology. These are
// patterns the tool DEFINES, so they are not configurable — a project that renamed them would be using
// a different tool. Only the e2e registries below need a location, because only the project knows it.
const DOC_GLOBS = ["**/.github/**/*.md", "**/system-design/**/*.md", "**/memories/**/*.md"];
const INSTRUCTION_GLOBS = [
  "**/CLAUDE.md", "**/copilot-instructions.md", "**/*.instructions.md",
  ".claude/agents/**/*.md", "**/*.agent.md", ".claude/settings*.json",
  ".claude/skills/*/SKILL.md",
];

/** PURE. Every glob the knowledge pass indexes: the tool's own conventions, plus the case/feature/
 *  cache registries hanging off the project's e2e dir. */
export function knowledgeGlobs(config: Config): string[] {
  return [
    ...DOC_GLOBS,
    e2ePath(config, "cases/**/*.cases.yaml"),
    e2ePath(config, "features/**/*.features.yaml"),
    e2ePath(config, "cache/**/*.cache.yaml"),
    ...INSTRUCTION_GLOBS,
  ];
}
