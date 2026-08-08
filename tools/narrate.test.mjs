// A narrated video must be reproducible by COMMAND, not by a model watching the run. The beat log
// carries the run's story ({t, kind, label} per step/check/note); a per-screen NARRATION PACK
// carries the words (authored once, pass AND fail variants); this library is the deterministic
// middle: pick the lines this run earned, map their wall-clock beats onto the video's own clock,
// lay them out so no line talks over the next, and emit the subtitle track. Pure functions — the
// piper/ffmpeg shell lives in narrate-run.mjs and is not under test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBeats, selectCues, buildAnchors, wallToVideo, layoutCues, toSrt } from './narrate.mjs'

const BEATS = [
  { t: 10000, kind: 'step', label: '1. Read the inherited fee — follows House View' },
  { t: 12000, kind: 'note', label: 'Method — got Ratio · expected Ratio' },
  { t: 14000, kind: 'req', label: 'R5 — An inherited selection is marked as inherited' },
  { t: 14100, kind: 'req-done', label: 'R5 fail' },
  { t: 14100, kind: 'step-done', label: '✗ 1. Read the inherited fee — follows House View' },
  { t: 15000, kind: 'step', label: '2. Show House View' },
  { t: 20000, kind: 'req-done', label: 'R1 pass' },
  { t: 20100, kind: 'step-done', label: '✓ 2. Show House View' }
]

const PACK = {
  intro: { spoken: 'A real test.', shown: 'A real test.' },
  outro: { spoken: 'The end.', shown: 'The end.' },
  cues: [
    { on: 'step', match: '^1\\.', spoken: 'Step one begins.', shown: 'Step one.' },
    { on: 'req-done', match: '^R5 pass', spoken: 'R5 holds.', shown: 'R5 holds.' },
    { on: 'req-done', match: '^R5 fail', spoken: 'R5 broke.', shown: 'R5 broke.' },
    { on: 'req-done', match: '^R1 pass', spoken: 'R1 holds.', shown: 'R1 holds.' },
    { on: 'step', match: '^9\\.', spoken: 'Never happens.', shown: 'Never happens.' }
  ]
}

test('parseBeats reads JSONL and skips blank lines', () => {
  const beats = parseBeats('{"t":1,"kind":"step","label":"a"}\n\n{"t":2,"kind":"note","label":"b"}\n')
  assert.equal(beats.length, 2)
  assert.equal(beats[1].kind, 'note')
})

test('selectCues picks the variant the run earned — fail line on a fail beat, no pass line', () => {
  const { cues, unmatched } = selectCues(BEATS, PACK)
  const texts = cues.map(c => c.spoken)
  assert.ok(texts.includes('R5 broke.'), 'the fail variant fires on the fail beat')
  assert.ok(!texts.includes('R5 holds.'), 'the pass variant must NOT fire — this run failed R5')
  assert.ok(texts.includes('R1 holds.'), 'a pass variant fires on a pass beat')
  assert.ok(texts.includes('Step one begins.'))
  assert.deepEqual(unmatched, ['step /^9\\./'], 'a pack line with no beat is reported, not silently dropped')
})

test('selectCues pins the intro to the start and the outro after the last beat', () => {
  const { cues } = selectCues(BEATS, PACK)
  assert.equal(cues[0].spoken, 'A real test.')
  assert.equal(cues[0].at, 'start')
  const last = cues[cues.length - 1]
  assert.equal(last.spoken, 'The end.')
  assert.equal(last.at, 'end')
  const middle = cues.slice(1, -1)
  for (let i = 1; i < middle.length; i++) assert.ok(middle[i].wall >= middle[i - 1].wall, 'cues stay in run order')
})

test('buildAnchors pairs the first step with the first ink onset and each ✗ paint with a red onset', () => {
  // band runs as the scanner reports them: light until the HUD paints, red at each failure paint
  const runs = [
    { t0: 0.0, t1: 2.2, state: 'light' },
    { t0: 2.3, t1: 5.9, state: 'ink' },
    { t0: 6.0, t1: 6.8, state: 'red' },
    { t0: 6.9, t1: 11.0, state: 'ink' }
  ]
  const anchors = buildAnchors(BEATS, runs, 12.0)
  assert.deepEqual(anchors[0], [10000, 2.3], 'first step beat ↔ first ink onset')
  assert.ok(anchors.some(([w, v]) => w === 14100 && v === 6.0), 'the ✗ paint ↔ the red onset')
  assert.ok(anchors.every(([, v]) => v <= 12.0))
})

test('wallToVideo interpolates between anchors and runs at 1:1 past the last one', () => {
  const f = wallToVideo([[10000, 2.0], [14000, 4.0]])
  assert.equal(f(10000), 2.0)
  assert.equal(f(12000), 3.0)                      // halfway in wall = halfway in video
  assert.equal(f(14000), 4.0)
  assert.ok(Math.abs(f(16000) - 6.0) < 1e-9, 'beyond the last anchor: slope 1 (1s wall = 1s video)')
  assert.equal(f(8000), 2.0, 'before the first anchor clamps to it')
})

test('layoutCues nudges a cue that would start while the previous line still speaks', () => {
  const laid = layoutCues([
    { t: 1.0, dur: 4.0, spoken: 'a', shown: 'a' },
    { t: 3.0, dur: 2.0, spoken: 'b', shown: 'b' }
  ], { gap: 0.25 })
  assert.equal(laid.cues[1].t, 5.25, 'second cue waits for the first + gap')
  assert.ok(laid.cues[1].nudged > 0)
  assert.equal(laid.endsAt, 7.25)
})

test('toSrt writes white-on-black-sized cues that never outlive the next line or the video', () => {
  const srt = toSrt([
    { t: 1.0, dur: 2.0, shown: 'first line' },
    { t: 10.0, dur: 5.0, shown: 'second line' }
  ], 12.0)
  assert.match(srt, /1\n00:00:01,000 --> 00:00:03,400\nfirst line/)
  assert.match(srt, /2\n00:00:10,000 --> 00:00:12,000\nsecond line/, 'clamped to the video end')
})
