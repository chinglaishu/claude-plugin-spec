// tools/evidence-fold.test.mjs — the pure half of the evidence HARVEST (Task 15, D2): where a
// requirement's frame pair and clip live on disk, how the reporter's attachments name them, and
// how a run's harvest FOLDS into the results index — merged per requirement, never replacing what
// a run did not touch, with superseded files named for pruning so disk stays bounded.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidencePaths, parseEvidenceAttachment, foldEvidence } from './evidence.mjs'

test('evidencePaths derives the deterministic per-requirement home under the screen dir', () => {
  assert.deepEqual(evidencePaths('board', 'R4'), {
    dir: 'spec/board/evidence',
    before: 'spec/board/evidence/R4.before.png',
    after: 'spec/board/evidence/R4.after.png',
    clip: 'spec/board/evidence/R4.clip.webp',
    clipVariants: { '1.5x': 'spec/board/evidence/R4.clip.15x.webp', '2x': 'spec/board/evidence/R4.clip.2x.webp' }
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
  clip: null,
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
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0' })
  const index = { board: { evidence: { R4: old } } }
  // the new fold cut NO clip (no ffmpeg this time) — the stale clip must be named for pruning;
  // the frame paths are deterministic, so they are overwritten in place and never pruned
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2' }) })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.webp'])
  assert.equal(index.board.evidence.R4.runId, 'r2', 'the newest fold wins')
})
test('retention: identical paths re-folded prune nothing', () => {
  const index = { board: { evidence: { R4: entry({ clip: 'spec/board/evidence/R4.clip.webp' }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r3' }) })
  assert.deepEqual(prune, [])
})

test('foldEvidence skips an unqualified id rather than inventing a screen', () => {
  const index = {}
  const prune = foldEvidence(index, { R4: entry() })
  assert.deepEqual(index, {})
  assert.deepEqual(prune, [])
})

// D1 (the human, 2026-08-22): a fold WITHOUT a video keeps the previous fold's clip — file and index
// entry — while the requirement is still proven and its wording is the one the clip was cut for.
// The pin is the requirement's TEXT hash (reqHash of the meaning text, the same pin Changed-drift
// uses), never the frame bytes: the frame pair is re-photographed on every fold and differs byte
// for byte each time (clocks, counts), so a content-hash rule would keep nothing, ever.
test('D1: a video-less fold carries the old clip forward when the text hash matches and the requirement is still proven', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', at: '2026-08-20T00:00:00.000Z', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) }, { proven: () => true })
  assert.deepEqual(prune, [], 'nothing is pruned — the clip file stays on disk')
  const e = index.board.evidence.R4
  assert.equal(e.clip, 'spec/board/evidence/R4.clip.webp', 'the clip path is carried into the new entry')
  assert.equal(e.runId, 'r2', 'the frames are the new fold\'s')
  assert.equal(e.clipRunId, 'r0', 'the clip says which run cut it')
  assert.equal(e.clipAt, '2026-08-20T00:00:00.000Z')
})
test('D1: a fold WITH a video replaces the clip and stamps its own run as the cutter', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', clipRunId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  foldEvidence(index, { 'board:R4': entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r5', hash: 'h1' }) }, { proven: () => true })
  assert.equal(index.board.evidence.R4.clipRunId, 'r5')
})
test('D1: the clip drops when the requirement\'s text hash moved (the proof is pinned to the wording)', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h2' }) }, { proven: () => true })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.webp'])
  assert.equal(index.board.evidence.R4.clip, null)
})
test('D1: the clip drops when the requirement is no longer proven this fold (no gif under a red chip)', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) }, { proven: () => false })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.webp'])
  assert.equal(index.board.evidence.R4.clip, null)
})
test('D1: an old entry with no hash pin (pre-D1 fold) cannot vouch for its clip — it drops', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) }, { proven: () => true })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.webp'])
})
test('D1: without a proven oracle the fold stays as strict as before (prune on any video-less refold)', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.webp'])
})

// ── Task 11: the clip's SPEED VARIANTS (1.5×/2× cut at harvest beside the 1×) ride the SAME D1
// decision as one set — a fold that keeps the 1× keeps the variants, a drop drops them all. The
// index shape is `clip` (unchanged — every pre-variant consumer keeps working) + `clipVariants`,
// an object keyed by the speed label ('1.5x'/'2x'), so a future speed extends the map without a
// schema change and the client looks a variant up by the label its button shows.
const VARS = { '1.5x': 'spec/board/evidence/R4.clip.15x.webp', '2x': 'spec/board/evidence/R4.clip.2x.webp' }
test('T11: a video-less fold carries the clip AND its variants forward together', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', clipVariants: VARS, runId: 'r0', at: '2026-08-20T00:00:00.000Z', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) }, { proven: () => true })
  assert.deepEqual(prune, [], 'the variant files stay on disk with the 1×')
  const e = index.board.evidence.R4
  assert.equal(e.clip, 'spec/board/evidence/R4.clip.webp')
  assert.deepEqual(e.clipVariants, VARS, 'the set is carried together')
  assert.equal(e.clipRunId, 'r0')
})
test('T11: a drop drops the whole set — every variant file is named for pruning with the 1×', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', clipVariants: VARS, runId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h2' }) }, { proven: () => true })
  assert.deepEqual(prune.sort(), [
    'spec/board/evidence/R4.clip.15x.webp',
    'spec/board/evidence/R4.clip.2x.webp',
    'spec/board/evidence/R4.clip.webp'
  ])
  assert.equal(index.board.evidence.R4.clip, null)
  assert.equal(index.board.evidence.R4.clipVariants ?? null, null)
})
test('T11: a fold WITH a fresh cut replaces the set — a variant the new cut lacks is pruned', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', clipVariants: VARS, runId: 'r0', clipRunId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  // the new cut landed the 1× and the 1.5× at the same deterministic paths, but the 2× cut failed
  const prune = foldEvidence(index, { 'board:R4': entry({
    clip: 'spec/board/evidence/R4.clip.webp',
    clipVariants: { '1.5x': 'spec/board/evidence/R4.clip.15x.webp' }, runId: 'r5', hash: 'h1'
  }) }, { proven: () => true })
  assert.deepEqual(prune, ['spec/board/evidence/R4.clip.2x.webp'], 'only the stale 2× file goes')
  assert.equal(index.board.evidence.R4.clipRunId, 'r5')
  assert.deepEqual(index.board.evidence.R4.clipVariants, { '1.5x': 'spec/board/evidence/R4.clip.15x.webp' })
})
test('T11: an old entry with a clip but NO variants (pre-T11 harvest) carries honestly — clip alone', () => {
  const old = entry({ clip: 'spec/board/evidence/R4.clip.webp', runId: 'r0', hash: 'h1' })
  const index = { board: { evidence: { R4: old } } }
  foldEvidence(index, { 'board:R4': entry({ runId: 'r2', hash: 'h1' }) }, { proven: () => true })
  assert.equal(index.board.evidence.R4.clip, 'spec/board/evidence/R4.clip.webp')
  assert.equal(index.board.evidence.R4.clipVariants ?? null, null, 'no variant is ever invented')
})
