// tools/skeleton-ignore.test.mjs — D2 (the human, 2026-08-22; final review M4): the evidence
// harvest (spec/<screen>/evidence/*.png at 640px, plus the .webp clip a board run cuts) is
// COMMITTED in a scaffolded project, exactly as it is in this repo — the board reads it by path and
// a fresh clone must show proof, not blanks. board.html stays as it is today (not ignored either).
// The scaffold's two ignore lists live in _skeleton.mjs so this test can pin what they never cover.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPEC_IGNORE, ROOT_IGNORE } from './_skeleton.mjs'

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

const EVIDENCE = [
  'board/evidence/R1.before.png', 'board/evidence/R1.after.png', 'board/evidence/R1.clip.webp',
  'asset-plan/evidence/R12.after.png'
]

test('D2: a scaffolded spec/.gitignore ignores NO evidence frame or clip', () => {
  assert.ok(SPEC_IGNORE.length > 0)
  for (const pat of SPEC_IGNORE) for (const f of EVIDENCE) {
    assert.ok(!ignores(pat, f), `spec/.gitignore pattern "${pat}" would hide ${f}`)
  }
})
test('D2: the root .gitignore entries ignore neither the evidence nor board.html', () => {
  for (const pat of ROOT_IGNORE) {
    for (const f of EVIDENCE) assert.ok(!ignores(pat, 'spec/' + f), `root pattern "${pat}" would hide spec/${f}`)
    assert.ok(!ignores(pat, 'board.html'), `root pattern "${pat}" would hide board.html`)
  }
})
test('D2: the spec ignore list still keeps the transient run state and real tokens out of git', () => {
  for (const f of ['_runs/1/a.webm', '_state-snapshot.9.json', '_auth-state.json', '_run-report.json']) {
    assert.ok(SPEC_IGNORE.some(p => ignores(p, f)), f + ' must stay ignored')
  }
})
