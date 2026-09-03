// The vendored skeleton — the ONE list of what specboard puts into a target project, plus the
// helpers that turn a source tree into a version manifest. Shared by BOTH scaffold.mjs (which writes
// the skeleton in) and update.mjs (which brings it up to a new release), so the two can never
// disagree about what a project is made of. A file added here is seen by both at once.

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, isAbsolute } from 'node:path'

// The tools, the shared test harness, the ONE design system, the Playwright config. NOT
// spec/<screen>/ — those are the target's own screens, never shipped.
export const FILES = [
  'tools/spec-store.mjs', 'tools/coverage.mjs', 'tools/journey.mjs', 'tools/build-board.mjs',
  // pure Given/When/Then parser — imported by spec-store.mjs (enrichReqs attaches r.behavior), so a
  // scaffolded project needs it or the vendored spec-store cannot load at all (update.test.mjs's
  // every-relative-import-is-vendored guard is what catches this class of miss).
  'tools/behavior.mjs',
  // pure kind/chapter derivation for the Flow view (board R13) — imported by serve-board.mjs, which
  // attaches chapters to every /api/runs record, so a scaffolded project's server cannot load
  // without it (the same guard-caught class of miss as behavior.mjs above).
  'tools/flow.mjs',
  // pure requirement-text hashing (two scopes) — imported by spec-store.mjs for the Changed-drift
  // pin (board R4's fifth word), so the vendored store cannot load without it (guard-caught too).
  'tools/reqhash.mjs',
  // pure requirement-schematic derivation (task 4, 2026-08-22): the archetype kit + vizHash/vizStale
  // — imported by spec-store.mjs (enrichReqs attaches r.viz, the committed drawing's staleness), so
  // the vendored store cannot load without it (the same guard-caught class of miss).
  'tools/viz.mjs',
  // the ONE overlay geometry (2026-08-30): the ring's inset and the callout's placement, imported
  // by BOTH tools/viz.mjs (the drawing) and spec/_base.ts (the burn-in). A scaffolded project that
  // got one and not the other would have a schematic and a photograph that no longer mirror.
  'tools/overlay-geometry.mjs',
  // …and the ONE callout TEXT rule beside it (2026-08-30): which single sentence a scene's card
  // says. Imported by BOTH tools/viz.mjs and spec/_base.ts for the same reason the geometry is —
  // a project with one copy and not the other has a drawing and a photograph that say different
  // things mid-beat.
  'tools/callout-text.mjs',
  // the CI gate's pure resolver (2026-08-30): spec/_ci.json is the chooser, this turns it into the
  // file list the workflow runs — and tools/spec-store.mjs now reads it too, so the board can mark
  // which screens gate CI without keeping a second opinion. Guard-caught (spec-store imports it),
  // and a scaffolded project needs it to choose its own gate at all.
  'tools/ci-select.mjs',
  // the viz pass's shell (task 4 review M2, fix round 1, 2026-08-22): the CLI a scaffolded project
  // runs to derive/commit its own schematics ("redraw is instant and free"). NOT caught by the
  // every-relative-import-is-vendored guard below — it's a CLI entry point, nothing vendored imports
  // it — so it must be listed directly or a scaffolded project has no hands to run the viz pass at all.
  'tools/viz-derive.mjs',
  // pure evidence-harvest logic (Task 15, D2): the proves-step window + ffmpeg frame args + the
  // per-requirement fold/prune — imported by both spec-store.mjs (foldEvidence) and the results reporter, so a
  // scaffolded project can load neither without it (the same guard-caught class of miss).
  'tools/evidence.mjs',
  // pure flow-composer logic (Task 5): parseBeats (spec-store reads each screen's steps.ts through
  // it) + deriveLibrary/composeCheck/emitFlow/composePrompt (build-board and serve-board) — the
  // vendored store cannot load without it (the same guard-caught class of miss).
  'tools/compose.mjs',
  'tools/board/client.js',
  // the gif-mode frame-stepper's pure timing math (Task 13) — read verbatim into board.html by
  // build-board.mjs exactly like client.js, so a scaffolded project's build cannot emit the board
  // without it. NOT caught by the every-relative-import-is-vendored guard (nothing imports it —
  // it is inlined), so it must be listed directly.
  'tools/board/stepper.js',
  'tools/serve-board.mjs',
  // the resilient directory watch serve-board.mjs builds both of its watchers on — an unhandled
  // FSWatcher 'error' (a watched directory deleted under Node's recursive walker, which is what
  // Linux inotify reports and macOS fsevents never does) would otherwise kill a scaffolded
  // project's board server outright. Guard-caught too, but it is listed for the same reason the
  // others are: the vendored server cannot load without it.
  'tools/watch-dir.mjs',
  // the voice-over pipeline serve-board drives when a run is voiced (init R6 / board R10): narrate.mjs
  // is the pure cue/subtitle/timing logic, narrate-run.mjs the piper+ffmpeg shell. Vendored so a
  // scaffolded project's own watchable run can actually voice — without them serve-board's voice wiring
  // has nothing to call and every run degrades to silent, even with piper installed.
  'tools/narrate.mjs', 'tools/narrate-run.mjs',
  'tools/crawl.mjs', 'tools/ship-record.mjs', 'tools/staff.mjs', 'tools/proof-integrity.mjs',
  // THE REPLICA'S GUARD (phase 3, 2026-09-03), pure: what "the replica looks like the app" means —
  // read by the in-page gate at capture time (spec/_base.ts) AND by `npm run proof mirror`
  // (tools/proof-integrity.mjs), so a scaffolded project cannot have one without the other.
  'tools/replica-gate.mjs',
  // pure: maps _config.json's signIn + named authProfiles into Playwright projects (imported by
  // playwright.board.ts). Unit-tested in tools/auth-projects.test.mjs.
  'tools/auth-projects.mjs',
  // this list itself (2026-09-04): spec-store.mjs imports appRoot from here (the ONE rule for where
  // the app lives in the sidecar layout), so the vendored store cannot load without it (guard-caught
  // by update.test.mjs's every-relative-import-is-vendored check). scaffold/update still run from the
  // plugin's own copy; the vendored one is inert beyond that import.
  'tools/_skeleton.mjs',
  'playwright.board.ts',
  'spec/_design.css', 'spec/_base.ts', 'spec/_fixture.ts',
  // the layout skeleton's walk (2026-09-03) — imported by spec/_base.ts and serialised into the page
  // under test; a project with _base.ts and not this cannot harvest a single evidence skeleton
  // (guard-caught by update.test.mjs's every-relative-import-is-vendored check)
  'spec/_layout-walk.mjs',
  // …and the ACTUAL REPLICA's capture beside it (2026-09-03): the app's own DOM around the ringed
  // element, sanitised, which spec/_base.ts serialises into the page at every harvested moment. A
  // project with _base.ts and not this cannot harvest a single replica (guard-caught by
  // update.test.mjs's every-relative-import-is-vendored check, exactly as the walk is)
  'spec/_replica.mjs',
  'spec/_state-guard.ts', 'spec/_state-guard-teardown.ts', 'spec/_results-reporter.mjs',
  // the optional auth setup — inert unless the target configures a signIn in spec/_config.json
  'spec/_auth.setup.ts',
  // the optional golden-data seed — an inert no-op stub until a project fills it in; the globalSetup
  // in _state-guard.ts runs it (or a `seed:e2e` script) before the suite. See the kg-e2e skill.
  'spec/_seed.ts',
  // the escape log — a bug the green board missed, logged with the assertion it hardened and the
  // skill that got the lesson. See kg-staff section 4.
  'spec/_escapes.md'
]

// The run scripts a scaffolded project gets. `board` runs under --watch so it restarts when its own
// code is re-vendored. (Updating to a new release is driven by the plugin's kg-update skill, which
// runs tools/update.mjs FROM the plugin — not a vendored script, which could only ever update the
// project from itself.)
export const SCRIPTS = {
  board: 'node --watch tools/serve-board.mjs',
  'board:build': 'node tools/build-board.mjs',
  staff: 'node tools/staff.mjs',
  proof: 'node tools/proof-integrity.mjs',
  e2e: 'playwright test --config=playwright.board.ts'
}

// What a scaffolded project's git must NOT track — the transient run state under spec/ and the
// update scratch at the root. NOT spec/_specboard.json (a committable record of the release), and
// NOT spec/<screen>/evidence/ or board.html: the harvested frames (640px) are the proof a
// fresh clone must show, so they are committed (D2, the human 2026-08-22). Pinned by
// tools/skeleton-ignore.test.mjs.
export const SPEC_IGNORE = [
  '_state-snapshot.*.json', '_dir-snapshot.*.json', '_run-report.json', '_runs/',
  '_conflicts.json', '_conflict-decisions.json', '_config.json', '_crawl.json', 'crawl.png',
  // the saved authenticated session — real tokens, never committed
  '_auth-state.json'
]
export const ROOT_IGNORE = ['.specboard-backup-*/', '*.new']

export const DEV = { '@playwright/test': '^1.62.0', '@types/node': '^22.0.0' }

// Where a project records which specboard release its vendored code corresponds to. Committable —
// it is a record of what the project is running, not transient run state.
export const MANIFEST = 'spec/_specboard.json'

// THE SIDECAR LAYOUT (the human, 2026-09-04: "put all specboard related file and image out of the
// dojostack_main repo … and make it still work"). A project's board — spec/, the vendored tools/,
// board.html, playwright.board.ts, node_modules — may live in a directory BESIDE the app repo, so the
// app repo carries none of the harvest. The tools already resolve their root to the directory they
// live in (spec-store ROOT), so the board runs unchanged from there; what the layout needs is the two
// directions to find each other, and both are one relative path:
//   app repo  → board:  `.specboard`, ONE line, the path of the board directory (committed — a clone
//                       must find its board too). Every skill and `update.mjs`/`scaffold.mjs` follow it.
//   board     → app:    `app` in spec/_specboard.json (carried across updates like `project`), read
//                       as APP_ROOT by spec-store — the project's own seed/auth helpers and the board's
//                       capabilities list (the app repo's .claude/ skills) resolve against it.
export const POINTER = '.specboard'

// The project directory a path MEANS. A scaffolded project (it has the manifest) is itself; an app
// repo carrying a pointer means the sidecar the pointer names; anything else is itself (a fresh
// scaffold target). Pure; unit-tested in tools/sidecar.test.mjs.
export function resolveProject (dir) {
  const d = resolve(dir)
  if (existsSync(join(d, MANIFEST))) return d
  const p = join(d, POINTER)
  if (!existsSync(p)) return d
  const target = readFileSync(p, 'utf8').split('\n').map(l => l.trim()).find(Boolean) || ''
  if (!target) return d
  return isAbsolute(target) ? target : resolve(d, target)
}

// Where the APP lives, seen from the board root: the manifest's `app` (relative to the board root)
// or, in the vendored-in layout, the board root itself. Pure; unit-tested in tools/sidecar.test.mjs.
export function appRoot (root, manifest) {
  const app = manifest && typeof manifest.app === 'string' && manifest.app.trim()
  return app ? resolve(root, app) : resolve(root)
}

// The manifest also carries the project's COMMITTED IDENTITY — `project: { name, tagline }`, the
// board crumb's authored source (Task 8 fix round 1, A-2: spec/_config.json is gitignored above, so
// an identity kept there vanishes on a clone). A fresh manifest (scaffold --force, update) is the
// new release's hashes + whatever `project` block the previous manifest carried — never invented,
// never dropped. Pure; unit-tested in tools/home-card.test.mjs and tools/update.test.mjs.
export function mergeManifest (fresh, prev) {
  const out = { ...fresh }
  if (prev && prev.project && typeof prev.project === 'object') out.project = { ...prev.project }
  // …and the sidecar's way back to its app repo (2026-09-04) — a path, never invented, never dropped
  if (prev && typeof prev.app === 'string' && prev.app.trim()) out.app = prev.app
  return out
}

// Content hash of a file, or null if it does not exist — "missing" has to be a first-class state a
// caller can branch on, distinct from "present but different".
export function hashFile (path) {
  if (!existsSync(path)) return null
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

// The specboard release a source tree IS — read from the plugin manifest, the one file that carries
// the version. Throws if it cannot be read: a manifest with a guessed version is worse than none.
export function readVersion (root) {
  const pj = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
  if (!pj.version) throw new Error('plugin.json has no version')
  return pj.version
}

// The manifest a source tree WOULD ship: its version, and the hash of every skeleton file as it
// stands in that tree. This is the base-of-record — the "as shipped" hashes an update compares a
// project's possibly-edited files against.
export function buildManifest (root) {
  const files = {}
  for (const rel of FILES) {
    const h = hashFile(join(root, rel))
    if (h !== null) files[rel] = h
  }
  return { version: readVersion(root), files }
}
