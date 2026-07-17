// config.ts — the repo topology, and its ONE owner.
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
// Founding design: docs/superpowers/specs/2026-07-17-founding-design.md (REQ-0, §10.8, §10.9)

/** One repo in the workspace. Exactly one has `subdir: ""` — it owns the workspace root. */
export type Repo = { name: string; subdir: string };

/** The whole topology. A single-repo project is `[{ name: "main", subdir: "" }]` — the degenerate case,
 *  and the one that proves "reusable" is real rather than aspirational (REQ-0). */
export type Repos = Repo[];

const bad = (msg: string): never => {
  throw new Error(`kg: invalid config — ${msg}`);
};

/**
 * Parse and VALIDATE a topology. Fails loudly and specifically; never returns a partial one.
 *
 * A half-valid topology silently misfiles every node in the missing repo — the same class of failure as
 * a report-only gate: confidently wrong beats obviously broken, and costs more to discover. So every
 * defect here is a throw, not a default.
 */
export function parseConfig(json: string): Repos {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return bad("not valid JSON");
  }
  const repos = (raw as { repos?: unknown })?.repos;
  if (!Array.isArray(repos) || repos.length === 0) return bad("`repos` must be a non-empty array");

  const out: Repos = [];
  for (const r of repos) {
    const name = (r as Repo)?.name;
    const subdir = (r as Repo)?.subdir;
    if (typeof name !== "string" || !name) return bad("every repo needs a non-empty `name`");
    if (typeof subdir !== "string") return bad(`repo '${name}' needs a \`subdir\` ("" for the root repo)`);
    if (out.some((o) => o.name === name)) return bad(`duplicate repo name '${name}' — ids would collide silently`);
    out.push({ name, subdir: subdir.replace(/\/+$/, "") });
  }

  const roots = out.filter((r) => r.subdir === "");
  if (roots.length === 0) return bad('no root repo — exactly one repo must have `subdir: ""`');
  if (roots.length > 1)
    return bad(`${roots.length} root repos (${roots.map((r) => r.name).join(", ")}) — the root cannot be ambiguous`);

  return out;
}

/**
 * PURE. Which repo owns this path?
 *
 * Matches the LONGEST subdir prefix, so a nested repo wins over a shallower one, and only on a path
 * BOUNDARY — `dojostack_backend_old/` is not `dojostack_backend`. The old implementation used a bare
 * `startsWith("dojostack_backend/")`, correct only because the trailing slash was baked into the
 * literal; making it configurable makes the boundary rule explicit rather than incidental.
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
