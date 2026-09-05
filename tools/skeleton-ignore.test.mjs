// tools/skeleton-ignore.test.mjs — WHAT A SCAFFOLDED PROJECT'S GIT TRACKS.
//
// Corrected 2026-09-06 (rule 6, with the reason attached). This file used to pin D2 (the human,
// 2026-08-22): "the evidence harvest is COMMITTED in a scaffolded project — a fresh clone must show
// proof, not blanks". Decision A (the human, 2026-09-05: "we only store things in codebase if it's
// necessary, otherwise find a way to store somewhere else") replaced the mechanism that made D2
// necessary: a fresh clone no longer reads proof out of git at all, it reads it out of the project's
// DATA HOME — ~/.specboard/<projectId>/, content-addressed and gc'd by reference at every fold. So
// the frames are ignored now, and what D2 was protecting — proof that survives the checkout — is
// protected by location instead. The AUTHORED files are what git keeps, and this file pins both
// halves: every derived thing hidden, every authored thing (the human's conflict rulings included)
// visible.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPEC_IGNORE, ROOT_IGNORE, FILES, boardIgnoreLines } from './_skeleton.mjs'

// a gitignore pattern → regex, enough for the shapes these lists use (no negation, no brace sets).
// A pattern with no slash matches at any depth; a trailing slash matches a directory and everything
// under it; `*` never crosses a slash.
function ignores (pattern, path) {
  let p = pattern.trim()
  if (!p || p.startsWith('#')) return false
  const dirOnly = p.endsWith('/')
  if (dirOnly) p = p.slice(0, -1)
  const anchored = p.includes('/')
  if (p.startsWith('/')) p = p.slice(1)
  const re = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*')
  const rx = new RegExp('^' + re + (dirOnly ? '(/.*)?' : '') + '$')
  if (anchored) return rx.test(path)
  // unanchored: any path segment suffix may match (a name at any depth)
  const parts = path.split('/')
  for (let i = 0; i < parts.length; i++) if (rx.test(parts.slice(i).join('/'))) return true
  return false
}

test('the glob helper reads the list\'s own shapes the way git does', () => {
  assert.ok(ignores('_runs/', '_runs/1/a.webm'))
  assert.ok(ignores('_state-snapshot.*.json', '_state-snapshot.123.json'))
  assert.ok(ignores('*.new', 'tools/spec-store.mjs.new'))
  assert.ok(ignores('.specboard-backup-*/', '.specboard-backup-2026/x'))
  assert.ok(!ignores('_runs/', 'board/evidence/R1.before.png'))
})

// Everything a RUN makes, seen from inside spec/ — the harvest a project used to commit, the fold,
// the run log and the raw report. All of it lives in the data home now; none of it in git.
const DERIVED = [
  'board/evidence/R1.before.png', 'board/evidence/R1.after.png',
  'board/evidence/R1.b1.before.layout.json', 'board/evidence/_fonts/abc.woff2',
  'board/evidence/R1.clip.webp',   // a legacy clip still on disk in an older project
  'asset-plan/evidence/R12.after.png',
  'board/viz/R1.svg', 'board/screen.png', 'board/crawl.png',
  '_results.json', '_results-index.json', '_runs.json', '_runs/1/a.webm',
  '_state-snapshot.9.json', '_auth-state.json', '_run-report.json', '_config.json'
]

// What a person WROTE. The whole point of the flip: the board folder is committed, and these are
// what a clone (and a code review, and CI) gets to read.
const AUTHORED = [
  'board/prd.md', 'board/test.spec.ts', 'board/steps.ts', 'board/narration.json',
  '_specboard.json', '_conflict-decisions.json'
]

test('decision A: a scaffolded spec/.gitignore hides every derived file', () => {
  assert.ok(SPEC_IGNORE.length > 0)
  for (const f of DERIVED) {
    assert.ok(SPEC_IGNORE.some(p => ignores(p, f)), `nothing in spec/.gitignore hides the derived ${f}`)
  }
})

test('decision A: it hides nothing a person authored — the human\'s conflict rulings included', () => {
  for (const pat of SPEC_IGNORE) for (const f of AUTHORED) {
    assert.ok(!ignores(pat, f), `spec/.gitignore pattern "${pat}" would hide the authored ${f}`)
  }
  // the ruling that used to be ignored as "transient run state": it is the human's decision, authored
  assert.equal(SPEC_IGNORE.includes('_conflict-decisions.json'), false)
  // …and the one exception in the other direction: per machine, and its sign-in script may carry a
  // credential, so it stays out (decision A's own refinement, 2026-09-05)
  assert.ok(SPEC_IGNORE.includes('_config.json'))
})

test('the root ignore list is the update scratch and nothing else', () => {
  for (const pat of ROOT_IGNORE) {
    for (const f of AUTHORED) assert.ok(!ignores(pat, 'spec/' + f), `root pattern "${pat}" would hide spec/${f}`)
  }
})

// The board FOLDER's own .gitignore, inside the app repo. The folder is committed now, so this list
// is the whole difference between "the authored board" and "a byte copy of the plugin plus a build".
test('the board folder hides its vendored code and its generated board, so a committed folder holds authored files only', () => {
  const lines = boardIgnoreLines()
  for (const f of FILES) assert.ok(lines.includes('/' + f), `vendored but not ignored inside the folder: ${f}`)
  for (const p of ['node_modules/', 'test-results/', 'board.html', 'spec/.auth/']) assert.ok(lines.includes(p), p)
  // …and it never hides what the folder exists to carry
  for (const f of ['spec/board/prd.md', 'spec/board/test.spec.ts', 'spec/board/steps.ts', 'spec/_specboard.json', 'spec/_conflict-decisions.json']) {
    assert.ok(!lines.some(p => ignores(p, f)), `the folder's .gitignore would hide the authored ${f}`)
  }
  // the app repo's own .gitignore is NOT touched any more — the folder is committed (2026-09-06)
  assert.equal(lines.includes('/specboard/'), false)
})
