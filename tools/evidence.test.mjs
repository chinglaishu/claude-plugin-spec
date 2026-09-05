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
  // 2026-08-28: a capture holds its BEATS, and the requirement-level pair is derived from them
  const cap = (tag, w, v) => ({ beats: { 1: { before: tag + '.b', after: tag + '.a', window: w } }, order: [1], srcVideo: v })
  const harvest = {}
  for (const r of ['R1', 'R2', 'R3', 'R4', 'R8']) harvest['todo:' + r] = {   // captured by BOTH, B last
    caps: { [A]: cap('A', win(10, 20), A), [B]: cap('B', win(90, 99), B) },
    latestKey: B }
  for (const r of ['R5', 'R6', 'R7']) harvest['todo:' + r] = {              // A only
    caps: { [A]: cap('A', win(30, 40), A) }, latestKey: A }
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
  const one = v => ({ beats: { 1: { before: 'b', after: 'a', window: v ? { from: 1, to: 2 } : null } }, order: [1], srcVideo: v })
  const harvest = {
    'board:R1': { caps: { [A]: one(A) }, latestKey: A },
    'board:R9': { caps: { _novideo: one(null) }, latestKey: '_novideo' }
  }
  const res = resolvePrimaryVideo(harvest)
  assert.equal(res['board:R1'].srcVideo, A, 'the single recording is the primary')
  assert.equal(res['board:R9'].srcVideo, null, 'a capture from no recording carries no video')
  assert.equal(res['board:R9'].before, 'b', 'but it still keeps its frames')
})

// ── 2026-08-28: per-BEAT evidence. A requirement proven by several checks harvests a pair per
// beat, and the requirement-level pair every existing reader consumes is DERIVED from them: beat
// 1's before, the last beat's after, and the span covering every beat between.
test('per-beat: the requirement-level pair is derived, and every beat keeps its own frames, layouts and window', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const V = 'spec/_runs/z/flow.webm'
  const harvest = {
    'todo:R5': {
      caps: {
        [V]: {
          srcVideo: V,
          order: [1, 2],
          beats: {
            1: { before: 'b1.png', after: 'a1.png', layoutBefore: 'b1.json', layoutAfter: 'a1.json', window: { from: 100, to: 400 } },
            2: { before: 'b2.png', after: 'a2.png', layoutBefore: 'b2.json', layoutAfter: 'a2.json', window: { from: 900, to: 1200 } }
          }
        }
      },
      latestKey: V
    }
  }
  const r = resolvePrimaryVideo(harvest)['todo:R5']
  assert.equal(r.before, 'b1.png', 'the requirement opens on beat 1\'s before')
  assert.equal(r.after, 'a2.png', 'and closes on the last beat\'s after')
  assert.deepEqual(r.window, { from: 100, to: 1200 }, 'its window spans every beat')
  assert.equal(r.beats.length, 2)
  // `values` (2026-08-29) is part of every beat's shape now — empty where the checks photographed
  // no asserted value, which is what a beat harvested before this change looks like.
  // `replicaExpectedBefore`/`replicaExpectedAfter` joined the beat's shape in phase 1 of the Expected View plan
  // (2026-09-03) — null where the run harvested no replica, exactly as the skeletons read on a beat
  // captured before they existed. This assertion was CORRECTLY broken by that change (rule 4).
  // …and `replicaExpectedAfter` in phase 2 (2026-09-03), on the same rule: a null where nothing was
  // harvested. Correctly broken by that change too (rule 4).
  assert.deepEqual(r.beats[0], { n: 1, before: 'b1.png', after: 'a1.png', layoutBefore: 'b1.json', layoutAfter: 'a1.json', replicaExpectedBefore: null, replicaExpectedAfter: null, replicaExpectedAfter: null, window: { from: 100, to: 400 }, values: [] })
  assert.deepEqual(r.beats[1].window, { from: 900, to: 1200 }, 'each beat keeps its OWN span, so a per-beat row seeks its own moment')
})

// ── 2026-08-29: the asserted-value frames inside a beat, in the order they were proven. A beat's
// proof plays before → each value → after, so the WHEN of a beat (a box carrying what was typed
// into it) is in frame at all — it is empty before the beat and cleared again after it.
test('per-beat: the asserted-value frames resolve in check order, each with its skeleton', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const harvest = {
    'todo:R1': {
      caps: {
        _novideo: {
          srcVideo: null,
          order: [1],
          beats: {
            1: {
              before: 'b1.png',
              after: 'a1.png',
              window: { from: 100, to: 4000 },
              // deliberately out of key order — the resolver sorts by the check number, never by
              // whatever order the attachments happened to land in
              values: { 2: { frame: 'v2.png', layout: 'v2.json' }, 1: { frame: 'v1.png', layout: 'v1.json' } }
            }
          }
        }
      },
      latestKey: '_novideo'
    }
  }
  const r = resolvePrimaryVideo(harvest)['todo:R1']
  assert.deepEqual(r.beats[0].values, [
    { k: 1, frame: 'v1.png', layout: 'v1.json', replicaExpected: null },
    { k: 2, frame: 'v2.png', layout: 'v2.json', replicaExpected: null }
  ])
})

// ── the WINDOWS of every check, in order — a requirement proven three times has three `proves`
// steps, and each beat must be paced and seeked by its own.
test('clipWindows returns one window per proves-step, in order', async () => {
  const { clipWindows } = await import('./evidence.mjs')
  const many = [
    { label: 'proves R5', cat: 'test.step', t: 100, d: 300 },
    { label: 'Click the row', cat: 'pw:api', t: 500, d: 10 },
    { label: 'proves R5', cat: 'test.step', t: 900, d: 300 }
  ]
  assert.deepEqual(clipWindows(many, 'R5'), [{ from: 100, to: 400 }, { from: 900, to: 1200 }])
  assert.deepEqual(clipWindows(many, 'R9'), [], 'a requirement never reached has no window')
})

// ── the FOCUS RECT — where the ring stood when the beat's after-frame was taken, so the board can
// zoom the media onto the component being proven. It is lifted out of the layout skeleton that
// already recorded it; no cropped file is ever written.
// ── 2026-08-29: a beat's camera frames the WHOLE beat. Its rings are now several — the value the
// When typed, then the value the Then produced — and one camera aimed at the last of them would
// crop the others clean out of the row, on both sides. The union is still ONE rect (board R19: one
// camera, both cells), and it is the region this beat's assertions actually ringed.
test('focusFromLayouts unions every ringed box of a beat, in the viewport they were measured in', async () => {
  const { focusFromLayouts } = await import('./evidence.mjs')
  const a = { w: 1440, h: 900, ring: { x: 100, y: 100, w: 200, h: 40 }, els: [] }
  const b = { w: 1440, h: 900, ring: { x: 400, y: 300, w: 100, h: 60 }, els: [] }
  assert.deepEqual(focusFromLayouts([a, b]), { x: 100, y: 100, w: 400, h: 260, vw: 1440, vh: 900 })
  assert.deepEqual(focusFromLayouts([null, b]), { x: 400, y: 300, w: 100, h: 60, vw: 1440, vh: 900 },
    'a phase that painted no ring simply adds nothing')
  assert.equal(focusFromLayouts([]), null)
  assert.equal(focusFromLayouts([{ w: 1440, h: 900, els: [] }]), null, 'no ring anywhere is no focus')
})

test('focusFromLayout lifts the ring + viewport out of a layout skeleton', async () => {
  const { focusFromLayout } = await import('./evidence.mjs')
  assert.deepEqual(
    focusFromLayout({ w: 1440, h: 900, ring: { x: 1180, y: 96, w: 120, h: 48 }, els: [] }),
    { x: 1180, y: 96, w: 120, h: 48, vw: 1440, vh: 900 })
})
test('focusFromLayout is null when no ring was painted, or the skeleton is unusable', async () => {
  const { focusFromLayout } = await import('./evidence.mjs')
  assert.equal(focusFromLayout({ w: 1440, h: 900, ring: null, els: [] }), null)
  assert.equal(focusFromLayout({ w: 1440, h: 900, ring: { x: 1, y: 1, w: 0, h: 10 }, els: [] }), null)
  assert.equal(focusFromLayout({ ring: { x: 1, y: 1, w: 10, h: 10 } }), null, 'no viewport, no zoom')
  assert.equal(focusFromLayout(null), null)
})

// ── THE MOMENT'S NAME (the human, 2026-09-02: "schematic and proof should share same stepper — as
// their steps must be same") ────────────────────────────────────────────────────────────────────
// A beat is ONE ordered list of MOMENTS: every value the test proved, in the order it proved them,
// then the beat's result. The drawing and the photograph are two renderings of that one list, so
// the row's one stepper names each moment by the assertion the run recorded — never "when 1".
// The name rides the value frame's own layout skeleton (spec/_base.ts snapValue passes the current
// CLAIM's label into snapLayout), beside the `at` offset that already rode there; this is the pure
// lift the reporter's fold makes out of that skeleton.
test('valueMeta lifts a value frame\'s offset AND the name of what was checked', async () => {
  const { valueMeta } = await import('./evidence.mjs')
  assert.deepEqual(valueMeta({ w: 1440, h: 900, at: 420, label: 'To do reads 6' }),
    { at: 420, label: 'To do reads 6' })
})
test('valueMeta omits what the skeleton does not carry — no field is ever invented', async () => {
  const { valueMeta } = await import('./evidence.mjs')
  assert.deepEqual(valueMeta({ w: 1440, h: 900, at: 0 }), { at: 0 }, 'an offset of 0 is an offset')
  assert.deepEqual(valueMeta({ label: 'the count' }), { label: 'the count' })
  assert.deepEqual(valueMeta({ w: 1440, h: 900 }), {}, 'an older harvest carries neither')
  assert.deepEqual(valueMeta(null), {})
})
// …and THE CLAIM the moment made (the human, 2026-09-02, on Tsumiki's failing R9: "for the failed
// test case, schematic should be correct … but now even the schematic is wrong as well"). A value
// frame's skeleton carries what the assertion asked for beside what the page gave it, so the drawn
// mirror can show the INTENT on a scene the app failed while the photograph keeps the measurement.
// Lifted whole or not at all: two strings and a boolean, or the moment simply carries no claim.
test('valueMeta lifts the CLAIM a value frame proved — expected, got, and whether it held', async () => {
  const { valueMeta } = await import('./evidence.mjs')
  assert.deepEqual(valueMeta({ w: 1440, h: 900, at: 420, label: 'To do reads 5', claim: { expected: '5', got: '4', ok: false } }),
    { at: 420, label: 'To do reads 5', claim: { expected: '5', got: '4', ok: false } })
  assert.deepEqual(valueMeta({ claim: { expected: '5', got: '5', ok: true } }).claim, { expected: '5', got: '5', ok: true },
    'a claim that held rides too — the drawing decides what to do with it, not the fold')
})
test('valueMeta refuses a claim that is not one — never a half-claim, never an invented verdict', async () => {
  const { valueMeta } = await import('./evidence.mjs')
  const no = c => assert.deepEqual(valueMeta({ claim: c }), {})
  no({ expected: '5', got: '4' })                       // no verdict is not a passing one
  no({ expected: '5', ok: false })                      // …and half a comparison is no comparison
  no({ got: '4', ok: false })
  no({ expected: 5, got: 4, ok: false })                // the page's own words, as strings
  no({ expected: '5', got: '4', ok: 'false' })
  no('5 vs 4')
  no(null)
  assert.deepEqual(valueMeta({ claim: { expected: '  5\n ', got: ' 4 ', ok: false } }).claim,
    { expected: '5', got: '4', ok: false }, 'collapsed like every other harvested string')
  assert.equal(valueMeta({ claim: { expected: 'x'.repeat(400), got: '4', ok: false } }).claim.expected.length, 140,
    'and bounded — what was written by a run is read back into an attribute')
})
test('valueMeta refuses a label that is not a usable name — collapsed, bounded, never blank', async () => {
  const { valueMeta } = await import('./evidence.mjs')
  assert.deepEqual(valueMeta({ label: '  To do\n  reads 6  ' }), { label: 'To do reads 6' },
    'whitespace is collapsed — a name is one line')
  assert.deepEqual(valueMeta({ label: '   ' }), {}, 'a blank name is no name')
  assert.deepEqual(valueMeta({ label: 42 }), {}, 'only a string is a name')
  assert.equal(valueMeta({ label: 'x'.repeat(400) }).label.length, 140, 'bounded — a segment is a label, not a paragraph')
  assert.deepEqual(valueMeta({ at: 'soon' }), {}, 'an unusable offset is no offset')
})

// ── 2026-09-03, phase 1 of the Expected View plan: the ACTUAL REPLICA of every moment resolves with
// the frame it was taken beside, and the web fonts the run fetched for the page ride out with the
// requirement so the fold can commit them once per screen.
test('per-beat: the replica of each phase and each asserted value resolves with its frame', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const harvest = {
    'todo:R1': {
      fonts: [{ hash: 'aaaa1111bbbb2222', family: 'Inter Tight', ext: 'woff2', src: '/tmp/x/font-aaaa1111bbbb2222.woff2' }],
      caps: {
        _novideo: {
          srcVideo: null,
          order: [1],
          beats: {
            1: {
              before: 'b1.png', after: 'a1.png',
              replicaExpectedBefore: 'b1.html', replicaExpectedAfter: 'a1.html',
              window: { from: 100, to: 4000 },
              values: { 1: { frame: 'v1.png', layout: 'v1.json', replicaExpected: 'v1.html' } }
            }
          }
        }
      },
      latestKey: '_novideo'
    }
  }
  const r = resolvePrimaryVideo(harvest)['todo:R1']
  assert.equal(r.beats[0].replicaExpectedBefore, 'b1.html')
  assert.equal(r.beats[0].replicaExpectedAfter, 'a1.html')
  assert.deepEqual(r.beats[0].values, [{ k: 1, frame: 'v1.png', layout: 'v1.json', replicaExpected: 'v1.html' }])
  assert.deepEqual(r.fonts, [{ hash: 'aaaa1111bbbb2222', family: 'Inter Tight', ext: 'woff2', src: '/tmp/x/font-aaaa1111bbbb2222.woff2' }],
    'the faces the page uses travel with the requirement, to be committed once per screen')
})

test('per-beat: the @font-face RULES the run read travel with the requirement too, beside the faces', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const rules = [{ cssText: '@font-face { font-family: "Inter"; src: url("https://x/i.woff2"); }', urls: ['https://x/i.woff2'] }]
  const harvest = {
    'todo:R1': {
      fonts: [{ hash: 'aaaa1111bbbb2222', url: 'https://x/i.woff2', ext: 'woff2', src: '/tmp/f.woff2' }],
      fontFaceRules: rules,
      caps: { _novideo: { srcVideo: null, order: [1], beats: { 1: { before: 'b.png', after: 'a.png' } } } },
      latestKey: '_novideo'
    }
  }
  const r = resolvePrimaryVideo(harvest)['todo:R1']
  assert.deepEqual(r.fontFaceRules, rules, 'the rules the fold turns into the screen\'s one faces.css')
})

test('per-beat: a requirement whose run fetched no font resolves to an empty set, never undefined', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const harvest = { 'todo:R1': { caps: { _novideo: { srcVideo: null, order: [1], beats: { 1: { before: 'b1.png', after: 'a1.png' } } } }, latestKey: '_novideo' } }
  assert.deepEqual(resolvePrimaryVideo(harvest)['todo:R1'].fonts, [])
  assert.deepEqual(resolvePrimaryVideo(harvest)['todo:R1'].fontFaceRules, [], 'and no rules either — an array, never undefined')
})


// ── 2026-09-03, phase 2: the EXPECTED replica resolves beside the Actual it is compared against —
// same capture, same moment, or the row would put two different moments side by side.
test('per-beat: the Expected replica of the after moment and of each asserted value resolves too', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const harvest = {
    'todo:R9': {
      caps: {
        _novideo: {
          srcVideo: null,
          order: [1],
          beats: {
            1: {
              before: 'b1.png', after: 'a1.png',
              replicaExpectedBefore: 'b1.html', replicaExpectedAfter: 'a1.html', replicaExpectedAfter: 'a1.exp.html',
              values: { 1: { frame: 'v1.png', layout: 'v1.json', replicaExpected: 'v1.html', replicaExpected: 'v1.exp.html' } }
            }
          }
        }
      },
      latestKey: '_novideo'
    }
  }
  const r = resolvePrimaryVideo(harvest)['todo:R9']
  assert.equal(r.beats[0].replicaExpectedAfter, 'a1.exp.html')
  assert.deepEqual(r.beats[0].values, [{ k: 1, frame: 'v1.png', layout: 'v1.json', replicaExpected: 'v1.html', replicaExpected: 'v1.exp.html' }])
})
test('per-beat: a moment that harvested no Expected replica says so with a null, never an absent key', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const harvest = { 'todo:R1': { caps: { _novideo: { srcVideo: null, order: [1], beats: { 1: { before: 'b.png', after: 'a.png', values: { 1: { frame: 'v1.png' } } } } } }, latestKey: '_novideo' } }
  const r = resolvePrimaryVideo(harvest)['todo:R1']
  assert.equal(r.beats[0].replicaExpectedAfter, null)
  assert.equal(r.beats[0].values[0].replicaExpected, null)
})

// ── 2026-09-03, phase 4a (B): the screen's ONE readable stylesheet of @font-face rules ──────────
// A replica is only the app's own picture while it is set in the app's own type, and the board
// renders it in an OPAQUE-ORIGIN srcdoc iframe that may reach no external URL. The harness lists
// each readable rule with the absolute urls it names (spec/_replica.mjs fontFaces) and fetches the
// files Node-side (spec/_base.ts harvestFonts → `font <hash> <family>` attachments → entry.fonts);
// this is the pure derivation between them: the rules that can actually be SERVED from the
// committed `_fonts/` dir, with every url rewritten to the file beside them.
test('deriveFacesCss rewrites a fetched url to the committed file, relative to the _fonts dir', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  const css = deriveFacesCss(
    [{ cssText: '@font-face { font-family: "Inter"; src: url("https://x.test/inter.woff2") format("woff2"); }', urls: ['https://x.test/inter.woff2'] }],
    [{ hash: 'aaaa1111bbbb2222', ext: 'woff2', family: 'Inter', url: 'https://x.test/inter.woff2', path: 'spec/s/evidence/_fonts/aaaa1111bbbb2222.woff2' }]
  )
  assert.equal(css, '@font-face { font-family: "Inter"; src: url("aaaa1111bbbb2222.woff2") format("woff2"); }')
})

test('deriveFacesCss drops a rule naming a url nothing fetched — a face that cannot be served is not declared', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  assert.equal(deriveFacesCss(
    [{ cssText: '@font-face { font-family: "Ghost"; src: url("https://x.test/ghost.woff2"); }', urls: ['https://x.test/ghost.woff2'] }],
    []
  ), '')
})

test('deriveFacesCss rewrites EVERY url of a multi-format rule, and drops the rule if any one is unfetched', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  const rule = {
    cssText: '@font-face { font-family: "Two"; src: url("https://x.test/a.woff2") format("woff2"), url("https://x.test/a.woff") format("woff"); }',
    urls: ['https://x.test/a.woff2', 'https://x.test/a.woff']
  }
  const both = [
    { hash: '1111aaaa2222bbbb', ext: 'woff2', url: 'https://x.test/a.woff2' },
    { hash: '3333cccc4444dddd', ext: 'woff', url: 'https://x.test/a.woff' }
  ]
  assert.equal(deriveFacesCss([rule], both),
    '@font-face { font-family: "Two"; src: url("1111aaaa2222bbbb.woff2") format("woff2"), url("3333cccc4444dddd.woff") format("woff"); }')
  assert.equal(deriveFacesCss([rule], [both[0]]), '', 'all of a rule\'s urls or none of the rule')
})

test('deriveFacesCss keeps a rule that names no fetchable url at all — a data:/local() face needs nothing committed', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  const rule = { cssText: '@font-face { font-family: "Sys"; src: local("Helvetica"); }', urls: [] }
  assert.equal(deriveFacesCss([rule], []), '@font-face { font-family: "Sys"; src: local("Helvetica"); }')
})

test('deriveFacesCss is deterministic — deduped by rule text and sorted, so a re-fold writes the same bytes', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  const b = { cssText: '@font-face { font-family: "B"; src: local("B"); }', urls: [] }
  const a = { cssText: '@font-face { font-family: "A"; src: local("A"); }', urls: [] }
  assert.equal(deriveFacesCss([b, a, b], []), a.cssText + '\n' + b.cssText)
  assert.equal(deriveFacesCss([a, b], []), deriveFacesCss([b, b, a], []))
})

test('deriveFacesCss neutralises a </style in a rule and stays bounded — the text goes into a <style> element', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  const css = deriveFacesCss([{ cssText: '@font-face { font-family: "</style><script>x</script>"; src: local("x"); }', urls: [] }], [])
  assert.ok(!/<\/style/i.test(css), 'nothing can close the element early: ' + css)
  const many = []
  for (let i = 0; i < 4000; i++) many.push({ cssText: '@font-face { font-family: "f' + i + '"; src: local("' + 'x'.repeat(60) + '"); }', urls: [] })
  assert.ok(deriveFacesCss(many, []).length <= 64000, 'bounded like every other by-product')
})

test('deriveFacesCss on an empty harvest is the empty string, never a stylesheet of nothing', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  assert.equal(deriveFacesCss([], []), '')
  assert.equal(deriveFacesCss(null, null), '')
})

// ── 2026-09-04, the review's C2: the sheet the BOARD serves is absolute ──────────────────────────
// faces.css lives beside the faces it declares, so its own urls are relative to `_fonts/` — correct
// on disk, and correct for anything that loads the FILE. The board does not: it writes the text into
// an `<iframe sandbox srcdoc>`, and an `about:srcdoc` document resolves a relative url against the
// PARENT's base — so `aaaa…woff2` would fetch `/aaaa…woff2`, 404 on every face, and the replica
// would render in a fallback stack: a picture of a different app, silently. This is the rewrite that
// stops it, done Node-side so it can be pinned here rather than inside the browser IIFE.
test('absoluteFacesCss points every relative url at the dir the sheet lives in', async () => {
  const { absoluteFacesCss } = await import('./evidence.mjs')
  assert.equal(
    absoluteFacesCss('@font-face { font-family: "I"; src: url("aaaa1111bbbb2222.woff2") format("woff2"); }',
      'spec/board/evidence/_fonts'),
    '@font-face { font-family: "I"; src: url("/spec/board/evidence/_fonts/aaaa1111bbbb2222.woff2") format("woff2"); }')
})
test('absoluteFacesCss rewrites EVERY url of a multi-format rule, quoted or bare', async () => {
  const { absoluteFacesCss } = await import('./evidence.mjs')
  const out = absoluteFacesCss("@font-face{src:url(a.woff2) format('woff2'),url('b.woff') format('woff')}", 'spec/s/evidence/_fonts')
  assert.ok(out.includes('url("/spec/s/evidence/_fonts/a.woff2")'), out)
  assert.ok(out.includes('url("/spec/s/evidence/_fonts/b.woff")'), out)
  assert.ok(!/url\(\s*["\']?[a-z0-9]+\.woff/i.test(out.replace(/url\("\/[^"]*"\)/g, '')), 'no relative url survives: ' + out)
})
test('absoluteFacesCss leaves a url that is already absolute, a data: face and an http one alone', async () => {
  const { absoluteFacesCss } = await import('./evidence.mjs')
  const css = '@font-face{src:url(/already/x.woff2)}\n@font-face{src:url(data:font/woff2;base64,AA)}\n@font-face{src:url(https://cdn.test/y.woff2)}'
  assert.equal(absoluteFacesCss(css, 'spec/s/evidence/_fonts'), css)
})
test('absoluteFacesCss with no dir, or no css, changes nothing rather than inventing a root', async () => {
  const { absoluteFacesCss } = await import('./evidence.mjs')
  assert.equal(absoluteFacesCss('@font-face{src:url(a.woff2)}', ''), '@font-face{src:url(a.woff2)}')
  assert.equal(absoluteFacesCss('', 'spec/s/evidence/_fonts'), '')
  assert.equal(absoluteFacesCss(null, null), '')
})
test('a sheet round-trips: deriveFacesCss writes it relative, absoluteFacesCss serves it absolute', async () => {
  const { deriveFacesCss, absoluteFacesCss, facesCssPath } = await import('./evidence.mjs')
  const rel = deriveFacesCss(
    [{ cssText: '@font-face { font-family: "Inter"; src: url("https://x.test/i.woff2"); }', urls: ['https://x.test/i.woff2'] }],
    [{ hash: 'aaaa1111bbbb2222', ext: 'woff2', url: 'https://x.test/i.woff2' }])
  assert.equal(rel, '@font-face { font-family: "Inter"; src: url("aaaa1111bbbb2222.woff2"); }')
  const dir = facesCssPath('board').replace(/\/faces\.css$/, '')
  assert.equal(absoluteFacesCss(rel, dir),
    '@font-face { font-family: "Inter"; src: url("/spec/board/evidence/_fonts/aaaa1111bbbb2222.woff2"); }')
})

// ── A DROPPED VALUE STILL SAYS SO (task 3b, item 5 — 2026-09-04) ───────────────────────────────
// `snapEvidence` bounds its screenshot so a slow page costs the bound and never the run. On a loaded
// machine that bound was reached, the value frame was never attached, and the fold — which kept a
// moment only if its PHOTOGRAPH landed — dropped the whole moment and pruned its replica. Four board
// beats then went red on a missing specimen, and nothing anywhere said why (task-4b, "what is red"
// #2). A by-product must stay bounded; a by-product that goes missing must be VISIBLE.
test('valueMeta lifts the flag a dropped photograph leaves on the skeleton beside it', async () => {
  const { valueMeta } = await import('./evidence.mjs')
  assert.deepEqual(valueMeta({ w: 1440, h: 900, at: 12, dropped: true }), { at: 12, dropped: true })
  assert.deepEqual(valueMeta({ w: 1440, h: 900, at: 12 }), { at: 12 }, 'a moment that photographed fine says nothing')
  assert.deepEqual(valueMeta({ dropped: 'yes' }), {}, 'only the flag itself, never a truthy anything')
})

test('a moment the run MEASURED survives the fold even when its photograph did not land', async () => {
  const { valueLanded } = await import('./evidence.mjs')
  assert.equal(valueLanded({ frame: 'a.png', layout: 'a.json' }), true)
  assert.equal(valueLanded({ frame: 'a.png', layout: null }), true, 'a photograph alone is a moment')
  assert.equal(valueLanded({ frame: null, layout: 'a.json' }), true, 'and so is a measurement alone — the drop is recorded, not swallowed')
  assert.equal(valueLanded({ frame: null, layout: null }), false, 'nothing at all is not a moment')
  assert.equal(valueLanded(null), false)
})

// ── ONE MOMENT COMES FROM ONE TEST (task 3b, 2026-09-04) ───────────────────────────────────────
// Two tests can prove the same requirement, and in a CLI run (no recording) both their captures land
// in the SAME per-beat slot, which fills first-wins PER FIELD. So a beat could take its skeleton
// from one test's page and its replica from another's — board R20's lightbox beat did exactly that:
// the skeleton was measured with the lightbox open (the toolbar behind it correctly dropped) and the
// replica came from the other test's page, where the lightbox is closed. The gate then read a
// picture of one page against a measurement of another (`extra-box 7`, `missing-text 4`), and no
// capture fix could ever have closed it. A slot belongs to whoever fills it first.
test('a beat slot is claimed by the first test to fill it, and refuses another test\'s artefacts', async () => {
  const { claimSlot } = await import('./evidence.mjs')
  const slot = {}
  assert.equal(claimSlot(slot, 'a test'), true, 'the first test claims it')
  assert.equal(claimSlot(slot, 'a test'), true, 'and keeps filling it')
  assert.equal(claimSlot(slot, 'another test'), false, 'a second test does not get to interleave')
  assert.equal(slot.by, 'a test', 'the owner rides on the slot, and nothing else')
})

// …AND THE FACE IS A BLOB NOW (the data home, 2026-09-05/06). The fold lands each face through
// putBlob and the sheet beside it, so the rule must name the BLOB's own file name — `<sha>.woff2` —
// not the `<hash>.<ext>` the harness happened to call it. Both stores make that a sibling of the
// sheet: `/blob/<sha>.css` and `/blob/<sha>.woff2` locally, `<bucket>/<sha>.css` and
// `<bucket>/<sha>.woff2` in the cloud — so one relative url is right in both.
test('deriveFacesCss names each face by the blob the fold landed it as, in either shape', async () => {
  const { deriveFacesCss } = await import('./evidence.mjs')
  const rules = [{ cssText: '@font-face{font-family:X;src:url(https://cdn/x.woff2)}', urls: ['https://cdn/x.woff2'] }]
  const sha = 'f'.repeat(64)
  assert.equal(
    deriveFacesCss(rules, [{ url: 'https://cdn/x.woff2', hash: 'abc', ext: 'woff2', path: 'blob/' + sha + '.woff2' }]),
    '@font-face{font-family:X;src:url(' + sha + '.woff2)}')
  assert.equal(
    deriveFacesCss(rules, [{ url: 'https://cdn/x.woff2', hash: 'abc', ext: 'woff2', path: 'https://bucket.test/specboard/' + sha + '.woff2' }]),
    '@font-face{font-family:X;src:url(' + sha + '.woff2)}')
  // a face with no landed path at all still declares itself by the name the harness gave it
  assert.equal(
    deriveFacesCss(rules, [{ url: 'https://cdn/x.woff2', hash: 'abc', ext: 'woff2' }]),
    '@font-face{font-family:X;src:url(abc.woff2)}')
})
