// tools/evidence-fold.test.mjs — the pure half of the evidence HARVEST (Task 15, D2): where a
// requirement's frame pair lives on disk, how the reporter's attachments name them, and how a
// run's harvest FOLDS into the results index — merged per requirement, never replacing what a run
// did not touch, with superseded files named for pruning so disk stays bounded. The webp clip and
// its Task 11 speed variants RETIRED with Task 13's frame-stepper (nothing rendered them once gif
// mode played the frames themselves); the fold still names a legacy entry's clip files for
// pruning, so an old index cleans itself up on its next fold.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidencePaths, parseEvidenceAttachment, foldEvidence } from './evidence.mjs'

test('evidencePaths derives the deterministic per-requirement home under the screen dir — frames only', () => {
  assert.deepEqual(evidencePaths('board', 'R4'), {
    dir: 'spec/board/evidence',
    before: 'spec/board/evidence/R4.before.png',
    after: 'spec/board/evidence/R4.after.png'
  })
})
test('evidencePaths takes the bare id off a qualified one — the home is the requirement\'s screen', () => {
  assert.equal(evidencePaths('asset-plan', 'asset-plan:R5').before, 'spec/asset-plan/evidence/R5.before.png')
})

test('parseEvidenceAttachment reads the phase pair names checkReq attaches', () => {
  assert.deepEqual(parseEvidenceAttachment('evidence R4 before'), { id: 'R4', phase: 'before' })
  assert.deepEqual(parseEvidenceAttachment('evidence asset-plan:R5 after'), { id: 'asset-plan:R5', phase: 'after' })
})
test('parseEvidenceAttachment refuses every other attachment name', () => {
  assert.equal(parseEvidenceAttachment('screenshot'), null)
  assert.equal(parseEvidenceAttachment('evidence R4 during'), null)
  assert.equal(parseEvidenceAttachment('failure-cover'), null)
  assert.equal(parseEvidenceAttachment(''), null)
})

const entry = (over = {}) => ({
  before: 'spec/board/evidence/R4.before.png',
  after: 'spec/board/evidence/R4.after.png',
  window: { from: 1200, to: 2000 },
  runId: 'r1',
  at: '2026-08-21T00:00:00.000Z',
  ...over
})

test('foldEvidence lands a harvest on its requirement, creating the screen entry if needed', () => {
  const index = {}
  const prune = foldEvidence(index, { 'board:R4': entry() })
  assert.deepEqual(prune, [])
  assert.deepEqual(index.board.evidence.R4, entry())
})

test('foldEvidence folds, never replaces: untouched requirements and screens keep their evidence', () => {
  const keepB = entry({ before: 'spec/board/evidence/R9.before.png', after: 'spec/board/evidence/R9.after.png' })
  const keepX = entry({ before: 'spec/x/evidence/R1.before.png', after: 'spec/x/evidence/R1.after.png' })
  const index = {
    board: { total: 1, tests: [], evidence: { R9: keepB } },
    x: { evidence: { R1: keepX } }
  }
  foldEvidence(index, { 'board:R4': entry() })
  assert.deepEqual(index.board.evidence.R9, keepB, 'a requirement the run did not touch keeps its evidence')
  assert.deepEqual(index.x.evidence.R1, keepX, 'a screen the run did not touch keeps its evidence')
  assert.deepEqual(index.board.evidence.R4, entry())
  assert.equal(index.board.total, 1, 'the rest of the screen entry is untouched')
})

test('a qualified cross-screen tag lands on the REQUIREMENT\'s screen, like coverage does', () => {
  const index = { board: { evidence: {} } }
  foldEvidence(index, { 'asset-plan:R5': entry({ before: 'spec/asset-plan/evidence/R5.before.png', after: 'spec/asset-plan/evidence/R5.after.png' }) })
  assert.ok(index['asset-plan'].evidence.R5, 'evidence rides the target screen\'s entry')
  assert.deepEqual(index.board.evidence, {}, 'the tagging test\'s own screen gains nothing')
})

test('retention: new evidence over old prunes exactly the superseded files no longer referenced', () => {
  const old = entry({ before: 'spec/board/evidence/R4.b-old.png', runId: 'r0' })
  const index = { board: { evidence: { R4: old } } }
  // deterministic paths overwrite in place and are never pruned; only a path the new entry
  // dropped (here the odd old before) is named
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2' }) })
  assert.deepEqual(prune, ['spec/board/evidence/R4.b-old.png'])
  assert.equal(index.board.evidence.R4.runId, 'r2', 'the newest fold wins')
})
test('retention: identical paths re-folded prune nothing', () => {
  const index = { board: { evidence: { R4: entry() } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r3' }) })
  assert.deepEqual(prune, [])
})

test('foldEvidence skips an unqualified id rather than inventing a screen', () => {
  const index = {}
  const prune = foldEvidence(index, { R4: entry() })
  assert.deepEqual(index, {})
  assert.deepEqual(prune, [])
})

// ── Task 13: the clip retirement CLEANS UP after Task 11/15. A legacy entry still naming a webp
// clip (and its 1.5×/2× variants) has them pruned on its next fold — nothing renders them (the
// frame-stepper plays the frames), so nothing may carry them forward either: the D1 carry retired
// with the clip it existed to keep, and no options bag revives it.
const VARS = { '1.5x': 'spec/board/evidence/R4.clip.15x.webp', '2x': 'spec/board/evidence/R4.clip.2x.webp' }
test('T13: a fold over a legacy clip-bearing entry names the whole set for pruning', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', clipVariants: VARS, runId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2' }) })
  assert.deepEqual(prune.sort(), [
    'spec/board/evidence/R4.clip.15x.webp',
    'spec/board/evidence/R4.clip.2x.webp',
    'spec/board/evidence/R4.clip.webp'
  ])
  const e = index.board.evidence.R4
  assert.equal('clip' in e, false, 'no clip field survives the fold')
  assert.equal('clipVariants' in e, false, 'no variant field survives it either')
})
test('T13: the carry is gone — a proven, hash-matched entry still sheds its legacy clip', () => {
  // exactly the case D1 used to carry: video-less fold, same text hash, still proven — the clip
  // now has no renderer, so keeping the file would be disk for nothing and a lie in the index
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', clipRunId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) }, { proven: () => true })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.webp'])
  assert.equal('clip' in index.board.evidence.R4, false)
  assert.equal('clipRunId' in index.board.evidence.R4, false, 'the cutter stamp retired with the cut')
})
