// tools/evidence-fold.test.mjs — the pure half of the evidence HARVEST (Task 15, D2): where a
// requirement's frame pair lives on disk, how the reporter's attachments name them, and how a
// run's harvest FOLDS into the results index — merged per requirement, never replacing what a run
// did not touch, with superseded files named for pruning so disk stays bounded. The webp clip and
// its Task 11 speed variants RETIRED with Task 13's frame-stepper (nothing rendered them once gif
// mode played the frames themselves); the fold still names a legacy entry's clip files for
// pruning, so an old index cleans itself up on its next fold.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidencePaths, beatEvidencePaths, valueEvidencePaths, fontEvidencePath, parseEvidenceAttachment, parseLayoutAttachment, parseReplicaAttachment, parseFontAttachment, foldEvidence } from './evidence.mjs'

test('evidencePaths derives the deterministic per-requirement home under the screen dir — frames only', () => {
  assert.deepEqual(evidencePaths('board', 'R4'), {
    dir: 'spec/board/evidence',
    before: 'spec/board/evidence/R4.before.png',
    after: 'spec/board/evidence/R4.after.png'
  })
})

// ── 2026-08-28: the harvest is PER BEAT (the board is becoming per-beat rows), and the
// requirement-level pair above is derived from it. Each beat keeps its frames and the layout
// skeletons its schematic frame is drawn from, one name away from the picture they measured.
test('beatEvidencePaths keys the harvest by the beat the check proves', () => {
  assert.deepEqual(beatEvidencePaths('board', 'R4', 2), {
    dir: 'spec/board/evidence',
    before: 'spec/board/evidence/R4.b2.before.png',
    after: 'spec/board/evidence/R4.b2.after.png',
    layoutBefore: 'spec/board/evidence/R4.b2.before.layout.json',
    layoutAfter: 'spec/board/evidence/R4.b2.after.layout.json',
    replicaBefore: 'spec/board/evidence/R4.b2.before.actual.html',
    replicaAfter: 'spec/board/evidence/R4.b2.after.actual.html',
    // the EXPECTED half of the resting moment joined the shape in phase 2 (2026-09-03) — this
    // assertion was correctly broken by that change (rule 4), not wrong before it
    replicaExpectedAfter: 'spec/board/evidence/R4.b2.after.expected.html'
  })
})
test('beatEvidencePaths takes the bare id off a qualified one, and defaults to beat 1', () => {
  assert.equal(beatEvidencePaths('asset-plan', 'asset-plan:R5', 1).before, 'spec/asset-plan/evidence/R5.b1.before.png')
  assert.equal(beatEvidencePaths('board', 'R4').layoutAfter, 'spec/board/evidence/R4.b1.after.layout.json')
})
test('evidencePaths takes the bare id off a qualified one — the home is the requirement\'s screen', () => {
  assert.equal(evidencePaths('asset-plan', 'asset-plan:R5').before, 'spec/asset-plan/evidence/R5.before.png')
})

// ── 2026-08-29: the ASSERTED-VALUE frames inside a beat. proveVisible photographs the page at the
// moment it rings a value and reads it, so the beat's proof plays before → each asserted value →
// after. Without them the WHEN of a beat is never in frame at all: a typed box is empty in the
// before frame and cleared again in the after one (demo todo R1 — the human, 2026-08-29).
test('valueEvidencePaths names each asserted-value frame inside its beat', () => {
  assert.deepEqual(valueEvidencePaths('todo', 'R1', 1, 2), {
    dir: 'spec/todo/evidence',
    frame: 'spec/todo/evidence/R1.b1.v2.png',
    layout: 'spec/todo/evidence/R1.b1.v2.layout.json',
    replica: 'spec/todo/evidence/R1.b1.v2.actual.html',
    replicaExpected: 'spec/todo/evidence/R1.b1.v2.expected.html'      // phase 2, 2026-09-03
  })
  assert.equal(valueEvidencePaths('todo', 'todo:R1', 3, 1).frame, 'spec/todo/evidence/R1.b3.v1.png',
    'a qualified id lands in the requirement\'s own screen, like every other path here')
})

test('parseEvidenceAttachment reads the beat-keyed phase pair names checkReq attaches', () => {
  assert.deepEqual(parseEvidenceAttachment('evidence R4#1 before'), { id: 'R4', beat: 1, phase: 'before' })
  assert.deepEqual(parseEvidenceAttachment('evidence asset-plan:R5#3 after'), { id: 'asset-plan:R5', beat: 3, phase: 'after' })
  // the un-keyed form still reads (an older run, a mixed tree) — the fold files it as beat 1
  assert.deepEqual(parseEvidenceAttachment('evidence R4 before'), { id: 'R4', beat: null, phase: 'before' })
})
test('parseEvidenceAttachment reads an asserted-value phase, numbered inside its beat', () => {
  assert.deepEqual(parseEvidenceAttachment('evidence R1#1 v1'), { id: 'R1', beat: 1, phase: 'v1' })
  assert.deepEqual(parseEvidenceAttachment('evidence todo:R1#2 v13'), { id: 'todo:R1', beat: 2, phase: 'v13' })
})
test('parseLayoutAttachment reads an asserted-value phase too — one skeleton per frame', () => {
  assert.deepEqual(parseLayoutAttachment('layout R1#1 v1'), { id: 'R1', beat: 1, phase: 'v1' })
})
test('a value phase must be numbered — a bare v is not a phase', () => {
  assert.equal(parseEvidenceAttachment('evidence R1#1 v'), null)
  assert.equal(parseEvidenceAttachment('evidence R1#1 v0x'), null)
})

test('parseEvidenceAttachment refuses every other attachment name', () => {
  assert.equal(parseEvidenceAttachment('screenshot'), null)
  assert.equal(parseEvidenceAttachment('evidence R4 during'), null)
  assert.equal(parseEvidenceAttachment('failure-cover'), null)
  assert.equal(parseEvidenceAttachment(''), null)
  assert.equal(parseEvidenceAttachment('layout R4 before'), null, 'a layout is not a frame')
})

// ── 2026-08-28: the LAYOUT skeleton rides beside the frame pair, named the same way ──
test('parseLayoutAttachment reads the layout pair names snapLayout attaches', () => {
  assert.deepEqual(parseLayoutAttachment('layout R4#1 before'), { id: 'R4', beat: 1, phase: 'before' })
  assert.deepEqual(parseLayoutAttachment('layout asset-plan:R5#2 after'), { id: 'asset-plan:R5', beat: 2, phase: 'after' })
  assert.deepEqual(parseLayoutAttachment('layout R4 before'), { id: 'R4', beat: null, phase: 'before' })
})
test('parseLayoutAttachment refuses every other attachment name', () => {
  assert.equal(parseLayoutAttachment('evidence R4 before'), null, 'a frame is not a layout')
  assert.equal(parseLayoutAttachment('layout R4 during'), null)
  assert.equal(parseLayoutAttachment('screenshot'), null)
  assert.equal(parseLayoutAttachment(''), null)
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
// ── Task 16 #1 (the human, 2026-08-24): the COMMITTED VIDEO. A board run commits the screen's
// primary recording under spec/<screen>/evidence/<hash>.webm and each requirement proven by that
// recording carries `video: {path, from, to}` — the seek offsets FROZEN at commit time, so a later
// fold's new window can never mis-seek an old recording. The video is SHARED per screen, so its
// carry and prune rules differ from the per-entry frames on purpose:
//   • a video-less fold (a CLI run) KEEPS the committed video — D1's carry, resurrected for an
//     artifact that has a renderer again (the reader's video mode plays it);
//   • a fold that brings a FRESH video replaces it;
//   • the committed file is pruned only when NO entry of its screen references it any more.
const vid = (path = 'spec/board/evidence/abc123def456.webm', from = 1200, to = 2000) => ({ path, from, to })

test('T16: a video-less fold carries the committed video, offsets frozen', () => {
  const old = entry({ video: vid() })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', window: { from: 9000, to: 9500 } }) })
  assert.deepEqual(prune, [], 'nothing is pruned by a carry')
  const e = index.board.evidence.R4
  assert.deepEqual(e.video, vid(), 'the video and its own from/to survive the video-less fold')
  assert.deepEqual(e.window, { from: 9000, to: 9500 }, 'while the frames take the NEW window')
})

test('T16: a fold with a fresh video replaces the old one — and prunes it once orphaned', () => {
  const old = entry({ video: vid('spec/board/evidence/oldhash000000.webm') })
  const index = { board: { evidence: { R4: old } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', video: vid('spec/board/evidence/newhash111111.webm', 3000, 3400) }) })
  assert.deepEqual(prune, ['spec/board/evidence/oldhash000000.webm'])
  assert.deepEqual(index.board.evidence.R4.video, vid('spec/board/evidence/newhash111111.webm', 3000, 3400))
})

test('T16: a shared video outlives one entry\'s replacement — pruned only when NO entry references it', () => {
  const shared = 'spec/board/evidence/shared0000000.webm'
  const index = {
    board: {
      evidence: {
        R4: entry({ video: vid(shared, 1000, 1500) }),
        R5: entry({ before: 'spec/board/evidence/R5.before.png', after: 'spec/board/evidence/R5.after.png', video: vid(shared, 4000, 4700) })
      }
    }
  }
  // R4 alone re-proves with a fresh recording — R5 still plays the shared one
  let prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', video: vid('spec/board/evidence/fresh00000000.webm') }) })
  assert.deepEqual(prune, [], 'the shared video is still referenced by R5')
  // now R5 re-proves on the fresh recording too — the shared file is finally orphaned
  prune = foldEvidence(index, { 'board:R5': entry({ before: 'spec/board/evidence/R5.before.png', after: 'spec/board/evidence/R5.after.png', runId: 'r2', video: vid('spec/board/evidence/fresh00000000.webm', 4000, 4700) }) })
  assert.deepEqual(prune, [shared])
})

test('T16: an entry that never had a video gains none from a video-less fold', () => {
  const index = { board: { evidence: { R4: entry() } } }
  foldEvidence(index, { 'board:R4': entry({ runId: 'r2' }) })
  assert.equal('video' in index.board.evidence.R4, false)
})

// ── 2026-08-28: PER-BEAT evidence. An entry carries `beats: [{n, before, after, layoutBefore,
// layoutAfter, window, focus?}]` beside the derived requirement-level pair. Every beat file is
// named for pruning when the new entry drops it, and the LAYOUT (the source the committed
// schematic was drawn from) follows the video's carry rule rather than the frames': a run whose
// capture failed must not delete the drawing's source and silently drop the requirement back to
// an archetype. A beat that brings fresh layouts replaces its own.
const beat = (n, over = {}) => ({
  n,
  before: `spec/board/evidence/R4.b${n}.before.png`,
  after: `spec/board/evidence/R4.b${n}.after.png`,
  layoutBefore: `spec/board/evidence/R4.b${n}.before.layout.json`,
  layoutAfter: `spec/board/evidence/R4.b${n}.after.layout.json`,
  window: { from: 100 * n, to: 100 * n + 50 },
  ...over
})
const noLay = n => beat(n, { layoutBefore: null, layoutAfter: null })

test('beats: a fold lands every beat, each with its own frames, layouts and window', () => {
  const index = {}
  const prune = foldEvidence(index, { 'board:R4': entry({ beats: [beat(1), beat(2)] }) })
  assert.deepEqual(prune, [])
  const e = index.board.evidence.R4
  assert.equal(e.beats.length, 2)
  assert.equal(e.beats[1].after, 'spec/board/evidence/R4.b2.after.png')
  assert.deepEqual(e.beats[1].window, { from: 200, to: 250 })
})

test('beats: a layout-less re-fold carries each beat\'s committed skeletons (and its focus rect)', () => {
  const index = { board: { evidence: { R4: entry({ beats: [beat(1, { focus: { x: 1, y: 2, w: 3, h: 4, vw: 1440, vh: 900 } })] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [noLay(1)] }) })
  assert.deepEqual(prune, [], 'nothing is pruned by a carry')
  const b = index.board.evidence.R4.beats[0]
  assert.equal(b.layoutBefore, 'spec/board/evidence/R4.b1.before.layout.json')
  assert.equal(b.layoutAfter, 'spec/board/evidence/R4.b1.after.layout.json')
  assert.deepEqual(b.focus, { x: 1, y: 2, w: 3, h: 4, vw: 1440, vh: 900 }, 'the zoom rides with its layout')
  assert.equal(index.board.evidence.R4.runId, 'r2', 'while everything else takes the new fold')
})

test('beats: a beat the new harvest dropped has all four of its files named for pruning', () => {
  const index = { board: { evidence: { R4: entry({ beats: [beat(1), beat(2)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [beat(1)] }) })
  assert.deepEqual(prune.sort(), [
    'spec/board/evidence/R4.b2.after.layout.json',
    'spec/board/evidence/R4.b2.after.png',
    'spec/board/evidence/R4.b2.before.layout.json',
    'spec/board/evidence/R4.b2.before.png'
  ], 'beat 2 no longer exists — its whole set goes')
})

// ── 2026-08-29: the asserted-value frames a beat carries are files like any other — a fold that
// drops one (the beat lost a check) must name it, or the tree grows frames nothing renders.
const withVals = (n, k) => beat(n, {
  values: Array.from({ length: k }, (_, i) => ({
    frame: `spec/board/evidence/R4.b${n}.v${i + 1}.png`,
    layout: `spec/board/evidence/R4.b${n}.v${i + 1}.layout.json`,
    at: 400 * (i + 1)
  }))
})
test('values: a fold keeps each beat\'s asserted-value frames, in order, with their offsets', () => {
  const index = {}
  foldEvidence(index, { 'board:R4': entry({ beats: [withVals(1, 2)] }) })
  const vs = index.board.evidence.R4.beats[0].values
  assert.equal(vs.length, 2)
  assert.equal(vs[1].frame, 'spec/board/evidence/R4.b1.v2.png')
  assert.equal(vs[0].at, 400, 'the offset into the beat\'s own window — what paces the loop')
})
test('values: the NAME of what each check proved rides the fold beside its offset', () => {
  // the human, 2026-09-02: the row has ONE stepper and each segment is named by the assertion the
  // run recorded — so the label has to survive the fold, or the strip can only say "when 1" again
  const index = {}
  const named = { n: 1, before: 'spec/board/evidence/R4.b1.before.png', after: 'spec/board/evidence/R4.b1.after.png',
    values: [{ frame: 'spec/board/evidence/R4.b1.v1.png', layout: 'spec/board/evidence/R4.b1.v1.layout.json', at: 400, label: 'To do reads 6' }] }
  foldEvidence(index, { 'board:R4': entry({ beats: [named] }) })
  assert.equal(index.board.evidence.R4.beats[0].values[0].label, 'To do reads 6')
})
test('values: the CLAIM a moment made rides the fold beside its name', () => {
  // the human, 2026-09-02, on Tsumiki's failing R9: the drawing must show what the requirement asks
  // for on a scene the app failed, so what the assertion EXPECTED has to survive the fold with what
  // the page actually gave it — the mirror reads both, the photograph keeps the measurement
  const index = {}
  const claimed = { n: 1, before: 'spec/board/evidence/R4.b1.before.png', after: 'spec/board/evidence/R4.b1.after.png',
    values: [{ frame: 'spec/board/evidence/R4.b1.v1.png', layout: 'spec/board/evidence/R4.b1.v1.layout.json', at: 400,
      label: 'To do reads 5', claim: { expected: '5', got: '4', ok: false } }] }
  foldEvidence(index, { 'board:R4': entry({ beats: [claimed] }) })
  assert.deepEqual(index.board.evidence.R4.beats[0].values[0].claim, { expected: '5', got: '4', ok: false })
})
test('values: a value frame the new harvest dropped is named for pruning', () => {
  const index = { board: { evidence: { R4: entry({ beats: [withVals(1, 2)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [withVals(1, 1)] }) })
  assert.deepEqual(prune.sort(), [
    'spec/board/evidence/R4.b1.v2.layout.json',
    'spec/board/evidence/R4.b1.v2.png'
  ], 'the second check is gone — its frame and its skeleton go with it')
})

test('beats: an entry that never had layouts gains none from a layout-less fold', () => {
  const index = { board: { evidence: { R4: entry({ beats: [noLay(1)] }) } } }
  foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [noLay(1)] }) })
  assert.equal(index.board.evidence.R4.beats[0].layoutBefore, null)
  assert.equal('focus' in index.board.evidence.R4.beats[0], false)
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

// ── 2026-09-03: the ACTUAL REPLICA rides beside every frame (phase 1 of the Expected View plan;
// the human's decision that day: the picture beside a proof is a real HTML replica of the app's own
// component). One file per moment, named the way the layout skeleton one name away from it is, and
// the web fonts the replica needs land once per screen under evidence/_fonts/.
test('beatEvidencePaths names the beat\'s two replicas beside its frames and skeletons', () => {
  const p = beatEvidencePaths('board', 'R4', 2)
  assert.equal(p.replicaBefore, 'spec/board/evidence/R4.b2.before.actual.html')
  assert.equal(p.replicaAfter, 'spec/board/evidence/R4.b2.after.actual.html')
  assert.equal(beatEvidencePaths('asset-plan', 'asset-plan:R5').replicaBefore,
    'spec/asset-plan/evidence/R5.b1.before.actual.html', 'a qualified id lands in its own screen, as ever')
})
test('valueEvidencePaths names the asserted value\'s replica', () => {
  assert.equal(valueEvidencePaths('todo', 'todo:R1', 3, 2).replica, 'spec/todo/evidence/R1.b3.v2.actual.html')
})
test('fontEvidencePath puts a screen\'s web fonts in one place, named by content', () => {
  assert.equal(fontEvidencePath('board', 'a1b2c3d4e5f60718', 'woff2'), 'spec/board/evidence/_fonts/a1b2c3d4e5f60718.woff2')
})

test('parseReplicaAttachment reads the names snapReplica attaches, and nothing else', () => {
  // `side` joined the shape in phase 2 (2026-09-03): a moment now files TWO replicas, the app's own
  // picture and the one the requirement asks for. These four assertions were correctly broken by
  // that change (rule 4) — the plain name is the ACTUAL, and always was.
  assert.deepEqual(parseReplicaAttachment('replica R4#1 before'), { id: 'R4', beat: 1, phase: 'before', side: 'actual' })
  assert.deepEqual(parseReplicaAttachment('replica asset-plan:R5#2 after'), { id: 'asset-plan:R5', beat: 2, phase: 'after', side: 'actual' })
  assert.deepEqual(parseReplicaAttachment('replica R1#1 v3'), { id: 'R1', beat: 1, phase: 'v3', side: 'actual' })
  assert.deepEqual(parseReplicaAttachment('replica R4 before'), { id: 'R4', beat: null, phase: 'before', side: 'actual' })
  assert.equal(parseReplicaAttachment('layout R4#1 before'), null, 'a skeleton is not a replica')
  assert.equal(parseReplicaAttachment('evidence R4#1 before'), null, 'nor is a frame')
  assert.equal(parseReplicaAttachment('replica R4#1 during'), null)
  assert.equal(parseReplicaAttachment('replica R1#1 v'), null, 'a value phase must be numbered')
  assert.equal(parseReplicaAttachment(''), null)
})
test('parseFontAttachment reads `font <hash> <family>` — a family may have spaces, a hash may not', () => {
  assert.deepEqual(parseFontAttachment('font a1b2c3d4e5f60718 Inter Tight'), { hash: 'a1b2c3d4e5f60718', family: 'Inter Tight' })
  assert.deepEqual(parseFontAttachment('font 0123456789abcdef Roboto'), { hash: '0123456789abcdef', family: 'Roboto' })
  assert.equal(parseFontAttachment('font NOTAHASH Inter'), null, 'a hash is hex')
  assert.equal(parseFontAttachment('font a1b2c3d4e5f60718'), null, 'and a font without a family is not one')
  assert.equal(parseFontAttachment('replica R4#1 before'), null)
  assert.equal(parseFontAttachment(''), null)
})

const rep = (n, over = {}) => beat(n, {
  replicaBefore: `spec/board/evidence/R4.b${n}.before.actual.html`,
  replicaAfter: `spec/board/evidence/R4.b${n}.after.actual.html`,
  ...over
})
test('replicas: a fold lands each beat\'s pair, and a replica-less re-fold CARRIES it (the layout\'s rule)', () => {
  // same reason the skeleton is carried: the replica is the source the Expected view is built from,
  // so a run whose capture failed must not delete it and drop the row back to a picture-less proof
  const index = { board: { evidence: { R4: entry({ beats: [rep(1)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [beat(1, { replicaBefore: null, replicaAfter: null })] }) })
  assert.deepEqual(prune, [], 'nothing is pruned by a carry')
  const b = index.board.evidence.R4.beats[0]
  assert.equal(b.replicaBefore, 'spec/board/evidence/R4.b1.before.actual.html')
  assert.equal(b.replicaAfter, 'spec/board/evidence/R4.b1.after.actual.html')
})
test('replicas: a beat that brings fresh ones replaces its own, and a dropped beat takes them with it', () => {
  const index = { board: { evidence: { R4: entry({ beats: [rep(1), rep(2)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [rep(1)] }) })
  assert.ok(prune.includes('spec/board/evidence/R4.b2.before.actual.html'))
  assert.ok(prune.includes('spec/board/evidence/R4.b2.after.actual.html'))
})
test('replicas: an asserted value\'s replica is pruned with its frame', () => {
  const withRep = k => beat(1, {
    values: Array.from({ length: k }, (_, i) => ({
      frame: `spec/board/evidence/R4.b1.v${i + 1}.png`,
      layout: `spec/board/evidence/R4.b1.v${i + 1}.layout.json`,
      replica: `spec/board/evidence/R4.b1.v${i + 1}.actual.html`
    }))
  })
  const index = { board: { evidence: { R4: entry({ beats: [withRep(2)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [withRep(1)] }) })
  assert.ok(prune.includes('spec/board/evidence/R4.b1.v2.actual.html'), prune.join(' '))
})
test('replicas: an entry that never had one gains none from a replica-less fold', () => {
  const index = { board: { evidence: { R4: entry({ beats: [beat(1)] }) } } }
  foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [beat(1)] }) })
  assert.equal('replicaBefore' in index.board.evidence.R4.beats[0], false)
})

// ── FIX ROUND 2 (task 3): the BEAT-level carry (this file's "replicas: a fold lands each beat's
// pair..." test, above) must not leak down to a VALUE moment. The carry exists so a run whose page
// tore down mid-capture does not delete the picture a row is built from — but a value moment that
// SURVIVES the re-harvest (same frame, same layout — this is not the "dropped entirely" case the
// test above covers) and comes back with no `replica` of its own was RE-CHECKED and re-gated this
// run; carrying the old picture forward would show a photograph beside a picture nobody just
// verified. No carry code exists for `values[].replica`/`replicaExpected` (only beats have one), so
// this is a REGRESSION PIN, not a fix — but it is exactly the C1 shape (fix round 1's review) one
// level down, and worth guarding the same way.
test('replicas: a re-harvested value moment whose new entry names no replica gets its old one pruned, not carried', () => {
  const withRep = k => beat(1, {
    values: Array.from({ length: k }, (_, i) => ({
      frame: `spec/board/evidence/R4.b1.v${i + 1}.png`,
      layout: `spec/board/evidence/R4.b1.v${i + 1}.layout.json`,
      replica: `spec/board/evidence/R4.b1.v${i + 1}.actual.html`
    }))
  })
  const noRep = k => beat(1, {
    values: Array.from({ length: k }, (_, i) => ({
      frame: `spec/board/evidence/R4.b1.v${i + 1}.png`,
      layout: `spec/board/evidence/R4.b1.v${i + 1}.layout.json`
      // the SAME value moment (same frame, same layout) — but THIS run's capture named no replica
    }))
  })
  const index = { board: { evidence: { R4: entry({ beats: [withRep(1)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [noRep(1)] }) })
  assert.ok(prune.includes('spec/board/evidence/R4.b1.v1.actual.html'), prune.join(' '))
  assert.equal('replica' in index.board.evidence.R4.beats[0].values[0], false, 'not carried onto the fresh entry either')
})

// FONTS are refcounted per SCREEN like the committed video: many requirements of one screen share
// the same face, so a file is pruned only when no entry of that screen names it any more.
const font = (hash, family = 'Inter Tight', ext = 'woff2') => ({ hash, family, ext, path: `spec/board/evidence/_fonts/${hash}.${ext}` })
test('fonts: a font-less fold carries the screen\'s faces rather than orphaning the replica', () => {
  const index = { board: { evidence: { R4: entry({ fonts: [font('aaaa1111bbbb2222')] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2' }) })
  assert.deepEqual(prune, [])
  assert.deepEqual(index.board.evidence.R4.fonts, [font('aaaa1111bbbb2222')])
})
test('fonts: a face no entry of the screen names any more is pruned, one still named is kept', () => {
  const shared = font('aaaa1111bbbb2222')
  const index = {
    board: {
      evidence: {
        R4: entry({ fonts: [shared] }),
        R5: entry({ before: 'spec/board/evidence/R5.before.png', after: 'spec/board/evidence/R5.after.png', fonts: [shared] })
      }
    }
  }
  let prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', fonts: [font('cccc3333dddd4444')] }) })
  assert.deepEqual(prune, [], 'R5 still wears the old face')
  prune = foldEvidence(index, { 'board:R5': entry({ before: 'spec/board/evidence/R5.before.png', after: 'spec/board/evidence/R5.after.png', runId: 'r2', fonts: [font('cccc3333dddd4444')] }) })
  assert.deepEqual(prune, ['spec/board/evidence/_fonts/aaaa1111bbbb2222.woff2'])
})


// ════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 2 (2026-09-03): beside every moment's ACTUAL replica, the EXPECTED one — the same markup
// with the beat's claims applied. It is the left half of the row (what the requirement says the app
// should have rendered), so it is landed, recorded, carried and pruned exactly like its Actual: a
// row that lost one and kept the other would be a comparison of two different moments.
// ════════════════════════════════════════════════════════════════════════════════════════════════
test('parseReplicaAttachment tells the Expected half from the Actual one', () => {
  assert.deepEqual(parseReplicaAttachment('replica-expected R9#1 after'), { id: 'R9', beat: 1, phase: 'after', side: 'expected' })
  assert.deepEqual(parseReplicaAttachment('replica-expected todo:R9#1 v3'), { id: 'todo:R9', beat: 1, phase: 'v3', side: 'expected' })
  assert.equal(parseReplicaAttachment('replica-expected'), null)
  assert.equal(parseReplicaAttachment('replica-expectedR9#1 after'), null, 'the name is two words, not a prefix')
  assert.equal(parseReplicaAttachment('replica-intended R9#1 after'), null, 'and only the one word')
})
test('the Expected replica has a path of its own beside the Actual, at every moment that has one', () => {
  const p = beatEvidencePaths('todo', 'R9', 1)
  assert.equal(p.replicaExpectedAfter, 'spec/todo/evidence/R9.b1.after.expected.html')
  assert.equal(p.replicaAfter, 'spec/todo/evidence/R9.b1.after.actual.html', 'one name away from it, as ever')
  // …and no `replicaExpectedBefore`: a beat's BEFORE moment has claimed nothing yet, so an Expected
  // there would be the Actual with a different name — a second file saying nothing (see spec/_base.ts)
  assert.equal('replicaExpectedBefore' in p, false)
  assert.equal(valueEvidencePaths('todo', 'todo:R9', 1, 3).replicaExpected, 'spec/todo/evidence/R9.b1.v3.expected.html')
})

const both = (n, over = {}) => rep(n, {
  replicaExpectedAfter: `spec/board/evidence/R4.b${n}.after.expected.html`,
  ...over
})
test('the Expected replica is CARRIED on the Actual\'s rule, and pruned with the beat that dropped it', () => {
  const index = { board: { evidence: { R4: entry({ beats: [both(1)] }) } } }
  let prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [beat(1, { replicaBefore: null, replicaAfter: null, replicaExpectedAfter: null })] }) })
  assert.deepEqual(prune, [], 'a capture that failed must not delete the picture the row is built from')
  assert.equal(index.board.evidence.R4.beats[0].replicaExpectedAfter, 'spec/board/evidence/R4.b1.after.expected.html')
  prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r3', beats: [] }) })
  assert.ok(prune.includes('spec/board/evidence/R4.b1.after.expected.html'), prune.join(' '))
})
test('an asserted value\'s Expected replica is pruned with its frame, like its Actual', () => {
  const withBoth = k => beat(1, {
    values: Array.from({ length: k }, (_, i) => ({
      frame: `spec/board/evidence/R4.b1.v${i + 1}.png`,
      replica: `spec/board/evidence/R4.b1.v${i + 1}.actual.html`,
      replicaExpected: `spec/board/evidence/R4.b1.v${i + 1}.expected.html`
    }))
  })
  const index = { board: { evidence: { R4: entry({ beats: [withBoth(2)] }) } } }
  const prune = foldEvidence(index, { 'board:R4': entry({ runId: 'r2', beats: [withBoth(1)] }) })
  assert.ok(prune.includes('spec/board/evidence/R4.b1.v2.expected.html'), prune.join(' '))
  assert.ok(!prune.includes('spec/board/evidence/R4.b1.v1.expected.html'), 'the one still named stays')
})

// ── FIX ROUND 1, C1 (2026-09-03): THE GATE'S VERDICT IS NOT A PATH ──────────────────────────────
// Phase 3's fold records what the in-page gate found on each landed replica. It first wrote that
// verdict to `values[k].replica` — which valueEvidencePaths has meant as the replica's FILE PATH
// since phase 1. The keep-set below is built from those very fields, so an object there is not the
// path string the old entry carried, the path is named for pruning, and the run DELETES the
// `.v<k>.actual.html` it has just written. The verdict lives in `gate` now; these two pin it.
const valued = (over = {}) => ({
  before: 'spec/todo/evidence/R1.before.png',
  after: 'spec/todo/evidence/R1.after.png',
  runId: 'r1',
  beats: [{
    n: 1,
    before: 'spec/todo/evidence/R1.b1.before.png',
    after: 'spec/todo/evidence/R1.b1.after.png',
    replicaBefore: 'spec/todo/evidence/R1.b1.before.actual.html',
    replicaAfter: 'spec/todo/evidence/R1.b1.after.actual.html',
    replicaExpectedAfter: 'spec/todo/evidence/R1.b1.after.expected.html',
    gate: { gaps: 0, gated: true },
    values: [{
      k: 1,
      frame: 'spec/todo/evidence/R1.b1.v1.png',
      layout: 'spec/todo/evidence/R1.b1.v1.layout.json',
      replica: 'spec/todo/evidence/R1.b1.v1.actual.html',
      replicaExpected: 'spec/todo/evidence/R1.b1.v1.expected.html',
      gate: { gaps: 0, gated: true }
    }]
  }],
  ...over
})

test('a value moment keeps its replica PATH and gains its gate verdict beside it', () => {
  const index = {}
  foldEvidence(index, { 'todo:R1': valued() })
  const v = index.todo.evidence.R1.beats[0].values[0]
  assert.equal(v.replica, 'spec/todo/evidence/R1.b1.v1.actual.html', 'the path is a path')
  assert.equal(v.replicaExpected, 'spec/todo/evidence/R1.b1.v1.expected.html')
  assert.deepEqual(v.gate, { gaps: 0, gated: true }, 'and the verdict has its own field')
  assert.deepEqual(index.todo.evidence.R1.beats[0].gate, { gaps: 0, gated: true })
})

test('a re-fold of the same harvest prunes nothing the new entry still references — C1', () => {
  const index = { todo: { evidence: { R1: valued() } } }
  const prune = foldEvidence(index, { 'todo:R1': valued({ runId: 'r2' }) })
  assert.deepEqual(prune, [], 'the value moment\'s replica files are still named by the new entry')
  assert.ok(!prune.includes('spec/todo/evidence/R1.b1.v1.actual.html'))
  assert.equal(index.todo.evidence.R1.beats[0].values[0].replica, 'spec/todo/evidence/R1.b1.v1.actual.html')
})

test('a value moment the new harvest DROPPED still has its files pruned', () => {
  const index = { todo: { evidence: { R1: valued() } } }
  const gone = valued({ runId: 'r2' })
  gone.beats[0].values = []
  const prune = foldEvidence(index, { 'todo:R1': gone })
  assert.ok(prune.includes('spec/todo/evidence/R1.b1.v1.actual.html'), 'the retention rule still works')
  assert.ok(prune.includes('spec/todo/evidence/R1.b1.v1.expected.html'))
})

test('why the verdict may not live in `replica`: a non-path there loses the file — C1 in one assertion', () => {
  // the shape the phase-3 reporter wrote before this fix: {gaps, gated} where the path belongs
  const index = { todo: { evidence: { R1: valued() } } }
  const clobbered = valued({ runId: 'r2' })
  clobbered.beats[0].values[0].replica = { gaps: 0, gated: true }
  const prune = foldEvidence(index, { 'todo:R1': clobbered })
  assert.ok(prune.includes('spec/todo/evidence/R1.b1.v1.actual.html'),
    'the keep-set is built from those very fields, so the run would delete the file it just wrote')
})
