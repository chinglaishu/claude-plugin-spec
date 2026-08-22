// tools/evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipWindow, ffmpegClipArgs, ffmpegFrameArgs, ffmpegDownscaleArgs } from './evidence.mjs'

const steps = [
  { label: 'Open /todo.html', cat: 'pw:api', t: 0, d: 400 },
  { label: 'proves R5', cat: 'test.step', t: 1200, d: 800 },
  { label: 'proves board:R6', cat: 'test.step', t: 3000, d: 500 }
]

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
test('ffmpegClipArgs seeks, clamps a minimum duration, scales and loops', () => {
  const args = ffmpegClipArgs('runs/x/video.webm', { from: 1200, to: 2000 }, 'runs/x/R5.webp')
  assert.deepEqual(args, [
    '-y', '-ss', '1.2', '-t', '0.8', '-i', 'runs/x/video.webm',
    '-an', '-vf', 'scale=640:-2:flags=lanczos,fps=12', '-loop', '0', 'runs/x/R5.webp'
  ])
})
test('ffmpegClipArgs clamps a sub-0.4s window up to 0.4s', () => {
  const args = ffmpegClipArgs('v.webm', { from: 100, to: 200 }, 'o.webp')
  assert.equal(args[args.indexOf('-t') + 1], '0.4')
})
test('ffmpegFrameArgs extracts a single frame at a timestamp, scaled', () => {
  assert.deepEqual(
    ffmpegFrameArgs('runs/x/video.webm', 2000, 'runs/x/R5-before.png'),
    ['-y', '-ss', '2', '-i', 'runs/x/video.webm', '-frames:v', '1', '-vf', 'scale=640:-2:flags=lanczos', 'runs/x/R5-before.png']
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

// ── final review M4 — the harvested frame pair is downscaled like the clip ─
test('ffmpegDownscaleArgs rescales a frame to the clip width (640, even height), overwriting', () => {
  assert.deepEqual(ffmpegDownscaleArgs('in.png', 'out.png'),
    ['-y', '-i', 'in.png', '-vf', 'scale=640:-2:flags=lanczos', 'out.png'])
})
