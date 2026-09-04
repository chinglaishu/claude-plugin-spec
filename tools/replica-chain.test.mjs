// tools/replica-chain.test.mjs — the Expected CHAIN is not the Expected FILE (final re-review's
// minor 4, 2026-09-04).
//
// `snapReplica` (spec/_base.ts) does four things per moment: it writes the moment's Expected file,
// it advances the beat's chain (`lastRight`, the last tree the app got right, and `lastExpected`,
// the tree the next moment is built from), and it harvests the faces the picture is set in. Three
// of those are properties of the BEAT, not of the file — and a moment whose gate walked the replica
// back and found NOTHING in it (a scene root that is all iframe or oversized canvas, which the
// capture plates) returned early from all four. So the chain silently stayed one moment further
// back than the beat had actually reached, and that moment's fonts were never fetched: a coupling
// between "no picture here" and "this moment did not happen", which is not what the harness means.
//
// snapReplica needs a live Page, so what is pinned here is its SHAPE, out of the shipped source —
// the same contract tools/repbody.test.mjs has with client.js. It goes red the moment the guard is
// a bare `return` again, which is exactly the regression this is for.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../spec/_base.ts', import.meta.url), 'utf8')

// the named function's own source, from its declaration to its matching close brace
function lift (src, decl) {
  const at = src.indexOf(decl)
  if (at < 0) throw new Error('no ' + decl + ' in spec/_base.ts — it was renamed or removed')
  const open = src.indexOf('{', at)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(at, i + 1) }
  }
  throw new Error('unbalanced braces lifting ' + decl)
}

const BODY = lift(SRC, 'async function snapReplica (')

test('the empty-walk guard decides the FILE, and returns from nothing', () => {
  const at = BODY.indexOf('!walked.els.length')
  assert.ok(at > 0, 'the "nothing measured in this replica" guard is still there')
  // the guard's own statement: whatever it does, it must not leave the function
  const stmt = BODY.slice(BODY.lastIndexOf('\n', at) + 1, BODY.indexOf('\n', at))
  assert.doesNotMatch(stmt, /\breturn\b/,
    'a moment with no picture is still a moment of the beat: ' + stmt.trim())
})

test('…so the beat\'s chain and its faces are reached whatever the gate saw', () => {
  const at = BODY.indexOf('!walked.els.length')
  const after = BODY.slice(at)
  for (const must of ['c.lastRight = ', 'c.lastExpected = ', 'await harvestFonts(']) {
    assert.ok(after.includes(must), must.trim() + ' must still be reached past the guard')
  }
})

test('and the file itself is what the guard suppresses — nothing writes an empty picture', () => {
  const at = BODY.indexOf('!walked.els.length')
  const write = BODY.indexOf('writeFileSync(file,')
  assert.ok(write > at, 'the Expected write comes after the guard')
  // the write is conditional on the guard's own answer, not merely on there being a body to write
  const cond = BODY.slice(BODY.lastIndexOf('if (', write), write)
  assert.match(cond, /noPicture/,
    'the write must still be refused where the walk found nothing: ' + cond.trim())
})
