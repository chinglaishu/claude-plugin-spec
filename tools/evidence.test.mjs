// tools/evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipWindow, ffmpegClipArgs } from './evidence.mjs'

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
