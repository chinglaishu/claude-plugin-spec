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
  'tools/spec-store.mjs', 'tools/build-board.mjs', 'tools/serve-board.mjs',
  'tools/crawl.mjs', 'tools/ship-record.mjs', 'tools/staff.mjs',
  'playwright.board.ts',
  'spec/_design.css', 'spec/_base.ts', 'spec/_fixture.ts',
  'spec/_state-guard.ts', 'spec/_state-guard-teardown.ts', 'spec/_results-reporter.mjs',
  // the optional auth setup — inert unless the target configures a signIn in spec/_config.json
  'spec/_auth.setup.ts',
  // the optional golden-data seed — an inert no-op stub until a project fills it in; the globalSetup
  // in _state-guard.ts runs it (or a `seed:e2e` script) before the suite. See the kg-e2e skill.
  'spec/_seed.ts'
]

// The run scripts a scaffolded project gets. `board` runs under --watch so it restarts when its own
// code is re-vendored. (Updating to a new release is driven by the plugin's kg-update skill, which
// runs tools/update.mjs FROM the plugin — not a vendored script, which could only ever update the
// project from itself.)
export const SCRIPTS = {
  board: 'node --watch tools/serve-board.mjs',
  'board:build': 'node tools/build-board.mjs',
  staff: 'node tools/staff.mjs',
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
