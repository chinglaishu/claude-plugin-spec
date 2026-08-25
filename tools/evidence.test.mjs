// tools/evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipWindow, ffmpegFrameArgs, ffmpegDownscaleArgs } from './evidence.mjs'

const steps = [
  { label: 'Open /todo.html', cat: 'pw:api', t: 0, d: 400 },
  { label: 'proves R5', cat: 'test.step', t: 1200, d: 800 },
  { label: 'proves board:R6', cat: 'test.step', t: 3000, d: 500 }
]

// The window is no longer a cut's input — the webp clip retired with Task 13's frame-stepper —
// but it is still harvested and folded: it anchors the stepper's before/after frames, so the
// stepper can play the pair at the assert body's TRUE relative pace (tools/board/stepper.js).
test('clipWindow finds the proves-step window by bare id', () => {
  assert.deepEqual(clipWindow(steps, 'R5'), { from: 1200, to: 2000 })
})
test('clipWindow matches a qualified step by its bare id', () => {
  assert.deepEqual(clipWindow(steps, 'R6'), { from: 3000, to: 3500 })
})
test('clipWindow returns null when the requirement was not reached (no step)', () => {
  assert.equal(clipWindow(steps, 'R9'), null)
})
test('clipWindow returns null when the step has no timestamp', () => {
  assert.equal(clipWindow([{ label: 'proves R1', cat: 'test.step' }], 'R1'), null)
})
test('ffmpegFrameArgs extracts a single frame at a timestamp, scaled', () => {
  assert.deepEqual(
    ffmpegFrameArgs('runs/x/video.webm', 2000, 'runs/x/R5-before.png'),
    ['-y', '-ss', '2', '-i', 'runs/x/video.webm', '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', 'runs/x/R5-before.png']
  )
})
test('ffmpegFrameArgs renders sub-second offsets with millisecond precision', () => {
  const args = ffmpegFrameArgs('v.webm', 1200, 'f.png')
  assert.equal(args[args.indexOf('-ss') + 1], '1.2')
})

// ── final review m1 (Task 15 L1) — exact label first ─────────────────────
test('clipWindow prefers the EXACT label — `proves dispatch:R7` is not aliased to an earlier bare `proves R7` in the same test', () => {
  const steps = [{ label: 'proves R7', t: 100, d: 50 }, { label: 'proves dispatch:R7', t: 900, d: 30 }]
  assert.deepEqual(clipWindow(steps, 'dispatch:R7'), { from: 900, to: 930 })
  assert.deepEqual(clipWindow(steps, 'R7'), { from: 100, to: 150 })
})
test('clipWindow still falls back to the bare form when only one side is qualified', () => {
  assert.deepEqual(clipWindow([{ label: 'proves dispatch:R7', t: 900, d: 30 }], 'R7'), { from: 900, to: 930 })
  assert.deepEqual(clipWindow([{ label: 'proves R7', t: 100, d: 50 }], 'dispatch:R7'), { from: 100, to: 150 })
})
test('clipWindow never aliases two DIFFERENT qualified ids — board:R7 is not dispatch:R7', () => {
  assert.equal(clipWindow([{ label: 'proves board:R7', t: 100, d: 50 }], 'dispatch:R7'), null)
})

// ── Task 16 #2 (the human, 2026-08-24, signed: 1280px) — the harvested frames read soft when the
// pane shows them large (Task 15) and at the near-fullscreen zoom; the house width is now 1280:
// a mild downscale of the 1440-wide viewport shot, crisp in-pane and near-native at the ×~1340 zoom.
test('ffmpegDownscaleArgs rescales a frame to the house 1280 width (even height), overwriting', () => {
  assert.deepEqual(ffmpegDownscaleArgs('in.png', 'out.png'),
    ['-y', '-i', 'in.png', '-vf', 'scale=1280:-2:flags=lanczos', 'out.png'])
})

// ── Task 16 #1 — the committed video: where the primary recording lands and how it is cut ─
test('T16: evidenceVideoPath names the screen\'s committed recording by content hash', async () => {
  const { evidenceVideoPath } = await import('./evidence.mjs')
  assert.equal(evidenceVideoPath('board', 'abc123def456'), 'spec/board/evidence/abc123def456.webm')
})
test('T16: ffmpegVideoArgs downscales to the house 1280 and re-encodes small (vp9 crf38, no audio)', async () => {
  const { ffmpegVideoArgs } = await import('./evidence.mjs')
  assert.deepEqual(ffmpegVideoArgs('spec/_runs/x/video.webm', 'spec/board/evidence/abc.webm'),
    ['-y', '-i', 'spec/_runs/x/video.webm', '-vf', 'scale=1280:-2:flags=lanczos',
      '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-cpu-used', '5', '-row-mt', '1', '-an',
      'spec/board/evidence/abc.webm'])
})

// ── Task 13: the clip cutter is GONE — the frame-stepper plays harvested frames, so nothing
// renders a webp clip and nothing may cut one. Retirement is pinned, not assumed: a module that
// quietly re-exports the cutter is a module about to cut unrendered files again.
test('T13: the module no longer exports the clip cutter or its speed set', async () => {
  const mod = await import('./evidence.mjs')
  assert.equal(mod.ffmpegClipArgs, undefined, 'ffmpegClipArgs retired with the webp clip (Task 13)')
  assert.equal(mod.CLIP_SPEEDS, undefined, 'the 1.5×/2× variant set retired with it')
  assert.equal(mod.carryClip, undefined, 'D1\'s carry had only the clip to carry — retired with it')
})

// ── the PRIMARY recording is the one covering the MOST requirements (not the last flow to run) ─
// Two flows on one screen: a COMPREHENSIVE flow (recording A) proving R1–R8, and a shorter COMPOSED
// flow (recording B) proving R1–R4,R8 that ran LAST. The old count keyed on the LAST capture per
// requirement (h.srcVideo, last-wins), so B's rerun of the shared beats reassigned them to B — B
// scored 5, A dropped to 3, and B stole the primary, leaving R6/R7 (A-only) video-less. Captures
// are kept PER recording now, coverage counted as a union, so A (8) wins and every requirement it
// proves rides A's recording — with A's own window, so the seek indexes the video that is shown.
test('T16 fix: primary = the recording covering the most requirements; shared reqs use its window', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const A = 'spec/_runs/x/full.webm'; const B = 'spec/_runs/x/composed.webm'
  const win = (from, to) => ({ from, to })
  const harvest = {}
  for (const r of ['R1', 'R2', 'R3', 'R4', 'R8']) harvest['todo:' + r] = {   // captured by BOTH, B last
    caps: { [A]: { before: 'A.b', after: 'A.a', window: win(10, 20), srcVideo: A },
      [B]: { before: 'B.b', after: 'B.a', window: win(90, 99), srcVideo: B } },
    latestKey: B }
  for (const r of ['R5', 'R6', 'R7']) harvest['todo:' + r] = {              // A only
    caps: { [A]: { before: 'A.b', after: 'A.a', window: win(30, 40), srcVideo: A } }, latestKey: A }
  const res = resolvePrimaryVideo(harvest)
  for (const r of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']) {
    assert.equal(res['todo:' + r].srcVideo, A, r + ' rides the comprehensive recording A (the primary)')
  }
  // a shared requirement uses A's window + frames, NOT B's last capture — the seek must index the shown video
  assert.equal(res['todo:R1'].window.from, 10, 'R1 keeps the primary recording A window, not B\'s')
  assert.equal(res['todo:R1'].before, 'A.b')
})
test('T16 fix: a lone recording stays primary; a video-less requirement resolves to no video', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const A = 'spec/_runs/y/only.webm'
  const harvest = {
    'board:R1': { caps: { [A]: { before: 'b', after: 'a', window: { from: 1, to: 2 }, srcVideo: A } }, latestKey: A },
    'board:R9': { caps: { _novideo: { before: 'b', after: 'a', window: null, srcVideo: null } }, latestKey: '_novideo' }
  }
  const res = resolvePrimaryVideo(harvest)
  assert.equal(res['board:R1'].srcVideo, A, 'the single recording is the primary')
  assert.equal(res['board:R9'].srcVideo, null, 'a capture from no recording carries no video')
  assert.equal(res['board:R9'].before, 'b', 'but it still keeps its frames')
})
