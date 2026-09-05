// tools/static-allow.test.mjs — the static server is an ALLOWLIST, not a traversal guard (the
// CLAUDE.md trap: this plugin runs inside other people's repos, and it once served .git/config).
// The data home added ONE kind to the two it had: a blob. There is no fourth — a run's record is a
// scratch directory now, and everything a run KEEPS is a blob like any other picture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowKind } from './static-allow.mjs'

test('allowKind names the three servable kinds and refuses everything else', () => {
  assert.equal(allowKind('board.html'), 'board')
  assert.equal(allowKind('spec/board/prd.md'), 'spec')
  assert.equal(allowKind('blob/' + 'a'.repeat(64) + '.png'), 'blob')
  assert.equal(allowKind('blob/' + 'a'.repeat(64) + '.html'), 'blob')
  assert.equal(allowKind('.git/config'), null)
  assert.equal(allowKind('package.json'), null)
  assert.equal(allowKind(''), null)
  assert.equal(allowKind('blob/../spec/x'), null)
  assert.equal(allowKind('spec/../.git/config'), null)
  // a blob is matched by SHAPE — the content address itself, never a name a caller invented
  assert.equal(allowKind('blob/notahash.png'), null)
  assert.equal(allowKind('blob/' + 'a'.repeat(64)), null)
  // the run-record directory is NOT servable: it is a run's scratch inside the data home, and what
  // the run keeps (its shots, its video, its log) is a blob
  assert.equal(allowKind('runs/1788509372511/run.log'), null)
})

test('the headers a kind earns: a CSP on any html, CORS on the faces a sandboxed replica fetches', () => {
  const sha = 'b'.repeat(64)
  assert.equal(allowKind('blob/' + sha + '.woff2'), 'blob')
  assert.equal(allowKind('blob/' + sha + '.css'), 'blob')
})
