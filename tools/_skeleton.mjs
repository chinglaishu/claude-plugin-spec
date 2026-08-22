// The vendored skeleton — the ONE list of what specboard puts into a target project, plus the
// helpers that turn a source tree into a version manifest. Shared by BOTH scaffold.mjs (which writes
// the skeleton in) and update.mjs (which brings it up to a new release), so the two can never
// disagree about what a project is made of. A file added here is seen by both at once.

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

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
  // the viz pass's shell (task 4 review M2, fix round 1, 2026-08-22): the CLI a scaffolded project
  // runs to derive/commit its own schematics ("redraw is instant and free"). NOT caught by the
  // every-relative-import-is-vendored guard below — it's a CLI entry point, nothing vendored imports
  // it — so it must be listed directly or a scaffolded project has no hands to run the viz pass at all.
  'tools/viz-derive.mjs',
  // pure evidence-harvest logic (Task 15, D2): clip windows + ffmpeg args + the per-requirement
  // fold/prune — imported by both spec-store.mjs (foldEvidence) and the results reporter, so a
  // scaffolded project can load neither without it (the same guard-caught class of miss).
  'tools/evidence.mjs',
  'tools/board/client.js',
  'tools/serve-board.mjs',
  // the voice-over pipeline serve-board drives when a run is voiced (init R6 / board R10): narrate.mjs
  // is the pure cue/subtitle/timing logic, narrate-run.mjs the piper+ffmpeg shell. Vendored so a
  // scaffolded project's own watchable run can actually voice — without them serve-board's voice wiring
  // has nothing to call and every run degrades to silent, even with piper installed.
  'tools/narrate.mjs', 'tools/narrate-run.mjs',
  'tools/crawl.mjs', 'tools/ship-record.mjs', 'tools/staff.mjs', 'tools/proof-integrity.mjs',
  // pure: maps _config.json's signIn + named authProfiles into Playwright projects (imported by
  // playwright.board.ts). Unit-tested in tools/auth-projects.test.mjs.
  'tools/auth-projects.mjs',
  'playwright.board.ts',
  'spec/_design.css', 'spec/_base.ts', 'spec/_fixture.ts',
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

export const DEV = { '@playwright/test': '^1.62.0', '@types/node': '^22.0.0' }

// Where a project records which specboard release its vendored code corresponds to. Committable —
// it is a record of what the project is running, not transient run state.
export const MANIFEST = 'spec/_specboard.json'

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
