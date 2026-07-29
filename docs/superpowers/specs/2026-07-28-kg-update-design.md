# kg-update — update a scaffolded project to a new specboard release

**Date:** 2026-07-28
**Status:** approved, pending implementation

## Problem

specboard vendors its board code (`tools/`, the `spec/_*` harness, `playwright.board.ts`) **into**
each target project. Updating the plugin updates only the skills, never a project's vendored copy.
`tools/scaffold.mjs` has exactly two modes and neither is a safe update:

- **skip-existing** (default): every file that already exists is left alone, so a scaffolded project
  never picks up a fix — it silently runs stale board code forever.
- **`--force`**: overwrites every file unconditionally, destroying any local edit (a project's
  `baseURL`, auth sign-in, forced-headless runs, etc.).

There is also no record of *what version a project was scaffolded from*, so nothing can tell "you
edited this file" apart from "this file is just old".

This was hit for real: a scaffolded project sat on an older release, and bringing it forward was
hand-surgery — diff every
vendored file against cached releases, copy the clean ones, graft local edits back onto the changed
one, rebuild, and restart the server. `kg-update` makes that a command.

## Non-goals

- Not a general dependency manager. It updates specboard's own vendored skeleton, nothing else.
- Not an auto-merger. A file you edited that also changed upstream is surfaced for a human/Claude
  merge, never merged by the tool (see Decision 1).
- Does not touch a project's own screens (`spec/<screen>/`) — those are the project's, never shipped.

## Decisions (settled with the CEO)

1. **Conflict policy = keep yours, write new alongside, report.** When a vendored file is locally
   edited *and* changed upstream, the tool backs it up, leaves the project's file in place, writes
   the incoming version as `<file>.new` beside it, and reports the conflict. It never loses an edit
   and never silently ships stale code. The update is honestly *partial* and names the files needing
   a merge. (Rejected: auto 3-way merge — a script merging a 2000-line `build-board.mjs` is where a
   silent wrong-merge hides, and that is the highest-stakes file. Rejected: overwrite-with-backup —
   the `--force` problem with a safety net, not a fix.)
2. **kg-update restarts the board as its final step.** The update is not "done" until the live server
   runs the new code — the exact gap hit today (page updated, server stale). The skill restarts using
   the saved restart procedure and verifies the running server reports the new version.

## Architecture

Mirrors `kg-init` → `scaffold.mjs`: a **skill** orchestrates, a **tool** does deterministic work.

```
skills/kg-update/SKILL.md     the workflow: detect version, run the tool, merge conflicts, restart
tools/update.mjs              deterministic file update; prints a structured report; no process work
tools/_skeleton.mjs   (new)   the shared source of truth: FILES, SCRIPTS, DEV
                              — imported by BOTH scaffold.mjs and update.mjs so the list never drifts
tools/update.test.mjs (new)   node --test spec for update.mjs's decision logic
spec/_specboard.json  (new)   the per-project version manifest (written by scaffold and update)
```

### The version manifest — `spec/_specboard.json`

Written at scaffold time and rewritten at update time. It is the base-of-record that makes "you
edited this" distinguishable from "this is old":

```json
{
  "version": "0.5.0",
  "files": {
    "tools/build-board.mjs": "<sha256 of the file as shipped by this version>",
    "tools/serve-board.mjs": "<sha256…>",
    "...": "..."
  }
}
```

- `version` is the specboard release the project's vendored code currently corresponds to.
- `files[path]` is the sha256 of the file **as shipped** by that version — not the project's possibly
  edited copy. This is what a later update compares against.
- Committable (not gitignored): it records what the project is running.

### `tools/update.mjs` — the decision, per file in the skeleton list

Given `shipped` (hash from the project manifest), `current` (hash of the project's file now) and
`incoming` (hash of the plugin's new version) — rows evaluated **top to bottom, first match wins**:

| Situation | Action |
|---|---|
| file missing in project | **add** — copy new; record incoming hash in manifest |
| `current == incoming` | **up-to-date** — skip; ensure manifest hash is incoming |
| `incoming == shipped` (file unchanged this release) | **skip** — do not disturb, even if locally edited |
| `current == shipped` (unmodified from base) | **update** — overwrite; record incoming hash |
| otherwise (locally edited **and** changed upstream) | **conflict** — back up, keep project file, write `<file>.new`, leave manifest hash unchanged |

After processing, the manifest's `version` is set to the new release **only if there are no
outstanding conflicts**; while conflicts remain the project is genuinely part-old, and the version
string must not claim otherwise. (Per-file hashes are advanced individually as above regardless.)

**Inputs:** target dir (default cwd), and the base version. The base comes from the manifest if
present; otherwise the skill passes `--from <ver>` (see manifest-less projects). `--dry-run` prints
the plan without writing.

**Output:** a structured report to stdout — lists under `added`, `updated`, `up-to-date`, `skipped`
(unchanged upstream), and `conflicts` (each with its `.new` path). Exit code is non-zero when
conflicts remain, so the skill knows the update needs a merge before it is complete.

**Backups:** each file the tool overwrites or conflicts on is copied first to
`.specboard-backup-<oldversion>/<path>` in the target, so any update is fully reversible.

### Manifest-less projects (existing scaffolds)

The tool requires a base; a project scaffolded before the manifest existed has none. The **skill**
establishes it: it matches each vendored file's current hash against the hashes of the plugin's
cached prior releases (`~/.claude/plugins/cache/specboard/specboard/<ver>/`) to find the release the
project most closely came from, and passes `--from <ver>`. Files matching no known release are
treated as conflicts (conservative — nothing is overwritten without a known base). The update writes
`spec/_specboard.json`, so every subsequent update on that project is clean and needs no guessing.

### The kg-update skill flow

1. Read the plugin's version (`.claude-plugin/plugin.json`) — the target release.
2. Read the project's version (`spec/_specboard.json`, else establish it as above).
3. If they are equal → report "already on `<ver>`" and stop.
4. Run `tools/update.mjs` against the project (with the base).
5. Report the outcome. For each **conflict**, offer to merge it: read the project file and the
   `.new`, graft the local edits onto the new version (e.g. a locally-edited `build-board.mjs`
   graft), then delete the `.new`. A conflict the user declines to merge is left as `.new` with a
   clear note.
6. Rebuild `board.html` (`node tools/build-board.mjs`). If `build-board.mjs` is itself an unmerged
   conflict, say so — the rebuild is running old renderer code until it is merged.
7. Restart the project's board (saved restart procedure): find the real listener on its port, confirm
   it is a serve-board process, stop it, relaunch detached under `node --watch`, and verify the
   running server reports the new version (`/api/runs` carries `runningId` from 0.5.0 on).
8. Summarise: what updated, what still needs a merge, and that the live server is on the new version.

## Testing

`update.mjs`'s decision logic is file-mutating, so it is written test-first (`node --test`,
`tools/update.test.mjs`, run via `npm run test:tools`). Each case builds a throwaway target dir with
a manifest and a file in one state, runs the update against a fixture "new" source, and asserts:

- **unmodified-from-base** → file overwritten with new; manifest hash bumped.
- **locally-edited + changed-upstream** → project file untouched; `<file>.new` written with new
  content; backup created; manifest hash unchanged; exit code non-zero.
- **already up-to-date** → no write.
- **unchanged-upstream + locally-edited** → skipped, local edit preserved, no `.new`.
- **missing file** → added.
- **manifest `version`** advances only when zero conflicts remain.

These assert outcomes that fail if the decision table is wrong — not merely that the tool ran.

## Files changed / added

- **new** `tools/_skeleton.mjs` — export `FILES`, `SCRIPTS`, `DEV`.
- **edit** `tools/scaffold.mjs` — import the list from `_skeleton.mjs`; write `spec/_specboard.json`
  with the shipped hashes; add `.specboard-backup-*/` and `*.new` to the generated `spec/.gitignore`.
- **new** `tools/update.mjs` — the update tool.
- **new** `tools/update.test.mjs` — its test.
- **edit** `package.json` — add `test:tools` script; the generated `SCRIPTS` gains an `update` entry
  (`node <plugin>/tools/update.mjs`) so a project can run it directly too.
- **new** `skills/kg-update/SKILL.md` — the skill.
- **edit** `CLAUDE.md` / plugin docs — mention kg-update alongside kg-init.
- **release** bump plugin + marketplace version once implemented and green.

## Open risks

- **Base detection for manifest-less projects is a heuristic.** It matches against whatever prior
  releases are in the local plugin cache; a project several versions old whose base release is not
  cached will show more files as conflicts than strictly necessary. That is safe (nothing is
  overwritten unknowingly) but noisier. The manifest written on first update removes the guessing
  thereafter.
- **The board restart is environment-specific** and stays in the skill (not the tool), because it
  finds and kills a process. Another session may be using the board on that port — the skill must say
  so before interrupting it.
