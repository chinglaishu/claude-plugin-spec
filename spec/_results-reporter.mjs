import { writeFileSync, copyFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { foldByScreen, recordRunEntry } from '../tools/spec-store.mjs'
import { coverageFromTest, qualify } from '../tools/coverage.mjs'
import { clipWindows, ffmpegDownscaleArgs, evidencePaths, beatEvidencePaths, valueEvidencePaths, parseEvidenceAttachment, parseLayoutAttachment, focusFromLayouts, valueMeta, evidenceVideoPath, ffmpegVideoArgs, resolvePrimaryVideo } from '../tools/evidence.mjs'

// The commit each run ran against, so a case that went red can be tied to the change that did it.
// Read once per run; empty outside a git repo, which this tool must keep working in.
const COMMIT = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { return '' }
})()

// Walk the step tree into a flat, ordered, indented list of the meaningful steps — the named
// steps a test author wrote (test.step), the actions Playwright took (pw:api, e.g. goto/click),
// and the assertions it made (expect). Hook and fixture noise is dropped. Capped so one test
// cannot bloat the record.
const STEP_NOISE = /^(Create (context|page|request context|browser context)|Launch browser|Close (context|page)|Fixture |Worker )/

// A Playwright step title reads like code — `Expect "toHaveCount" locator('.row')`. Turn it into a
// sentence a person can read. Generic, because this tool runs in other people's repos: it works
// off the matcher names and locator shapes, not any one project's selectors.
const MATCH = {
  toBeVisible: 'is visible', toBeHidden: 'is hidden', toBeAttached: 'is on the page',
  toHaveCount: 'has the expected number', toContainText: 'contains the expected text',
  toHaveText: 'reads the expected text', toHaveValue: 'has the expected value',
  toBeEnabled: 'is enabled', toBeDisabled: 'is disabled', toBeEditable: 'can be edited',
  toBeChecked: 'is ticked', toBeFocused: 'has focus', toHaveAttribute: 'has the expected attribute',
  toHaveClass: 'has the expected class', toHaveURL: 'is at the expected address',
  toBeGreaterThan: 'is more than expected', toBeGreaterThanOrEqual: 'is at least the expected',
  toBeLessThan: 'is fewer than expected', toBeLessThanOrEqual: 'is at most the expected',
  toBe: 'is what we expect', toEqual: 'equals what we expect', toMatch: 'matches the pattern',
  toHaveProperty: 'has the expected property', toBeTruthy: 'is set', toBeNull: 'is empty',
  toPass: 'eventually holds', toBeOK: 'succeeded'
}

function prettyTarget (loc) {
  let m
  if ((m = loc.match(/getByRole\((['"])(.*?)\1(?:.*?name:\s*(['"])(.*?)\3)?/))) {
    return 'the ' + m[2] + (m[4] ? ' “' + m[4] + '”' : '')
  }
  if ((m = loc.match(/getByText\((['"])(.*?)\1/))) return 'the text “' + m[2] + '”'
  if ((m = loc.match(/getBy(?:Label|Placeholder)\((['"])(.*?)\1/))) return 'the field “' + m[2] + '”'
  if ((m = loc.match(/getByTestId\((['"])(.*?)\1/))) return 'the “' + m[2] + '”'
  if ((m = loc.match(/locator\((['"])(.*?)\1\)/))) return 'the “' + m[2] + '”'
  return loc.replace(/\)\.(first|last|nth)\([^)]*\)/g, ')').slice(0, 70)
}

function humanize (cat, title) {
  if (cat === 'test.step') return title // the author's own words — already a sentence
  let m
  if (cat === 'expect') {
    if (!(m = title.match(/Expect "([^"]+)"\s*(.*)/))) return title
    const phrase = MATCH[m[1]] || ('passes ' + m[1])
    const tgt = m[2] ? prettyTarget(m[2]) : ''
    return tgt ? 'Check ' + tgt + ' ' + phrase : 'Check the result ' + phrase
  }
  if ((m = title.match(/^Navigate to "?([^"]*)"?/))) return 'Open ' + m[1]
  if (/^Reload/.test(title)) return 'Reload the page'
  if ((m = title.match(/^Go (back|forward)/))) return 'Go ' + m[1]
  if ((m = title.match(/^Double click (.+)/))) return 'Double-click ' + prettyTarget(m[1])
  if ((m = title.match(/^Click (.+)/))) return 'Click ' + prettyTarget(m[1])
  if ((m = title.match(/^(?:Fill|Type) (.+)/))) return 'Type into ' + prettyTarget(m[1])
  if ((m = title.match(/^Press (.+)/))) return 'Press ' + m[1]
  if ((m = title.match(/^Check (.+)/))) return 'Tick ' + prettyTarget(m[1])
  if ((m = title.match(/^Hover (.+)/))) return 'Hover over ' + prettyTarget(m[1])
  if (/^Wait for load state/.test(title)) return 'Wait for the page to load'
  if (/^Wait for navigation/.test(title)) return 'Wait for the page to change'
  if (/^Wait for (timeout|\d)/.test(title)) return 'Pause briefly'
  if ((m = title.match(/^Wait for (?:selector )?(.+)/))) return 'Wait for ' + prettyTarget(m[1])
  if ((m = title.match(/^Query count (.+)/))) return 'Count ' + prettyTarget(m[1])
  if ((m = title.match(/^Bounding box (.+)/))) return 'Measure where ' + prettyTarget(m[1]) + ' is'
  if ((m = title.match(/^Get attribute (.+)/))) return 'Read an attribute of ' + prettyTarget(m[1])
  if ((m = title.match(/^(GET|POST|PUT|DELETE|PATCH) "?([^"\s]*)"?/))) return m[1] + ' request to ' + m[2]
  if (/^Evaluate/.test(title)) return 'Run a script on the page'
  if (/^Screenshot/.test(title)) return 'Take a screenshot'
  if ((m = title.match(/^Wait for (.+)/))) return 'Wait for ' + m[1]
  return title
}

// Exported for tools/reporter-steps.test.mjs. Each kept step carries `t` — its offset in ms from
// the moment the RECORDING starts — so the board's player can name the step under the playhead
// (board R10). Playwright records video per PAGE, so the `Create page` step (dropped as noise, but
// still in the tree) is the recording's t=0; without one, the first kept step reads as t=0.
export function flattenSteps (steps) {
  const findEpoch = list => {
    for (const s of list || []) {
      if (/^Create page/.test(String(s.title || ''))) return s
      const hit = findEpoch(s.steps)
      if (hit) return hit
    }
    return null
  }
  const e = findEpoch(steps)
  let epoch = e && e.startTime ? +new Date(e.startTime) : null
  const out = []
  let dropped = 0
  const walk = (list, depth) => {
    for (const s of list || []) {
      const title = String(s.title || '')
      // fixture/context setup is framework plumbing, not a step of the test
      const keep = ['test.step', 'pw:api', 'expect'].includes(s.category) && !STEP_NOISE.test(title)
      if (keep) {
        // capped so one test cannot bloat the record… but a `proves <id>` step is never dropped:
        // it is the requirement's coverage AND its clip window (tools/evidence.mjs clipWindow) —
        // the cap once swallowed every proof a long flow made late, and those requirements lost
        // their gifs (Tsumiki R3–R8, 2026-08-23). The cap trims noise, never a proof.
        const isProof = s.category === 'test.step' && /^proves /.test(title)
        if (out.length >= 80 && !isProof) dropped++
        else {
          const at = s.startTime ? +new Date(s.startTime) : null
          if (epoch == null && at != null) epoch = at
          // a `note: ` step is a narration line the test announced (a got/expected value) — the
          // board shows it as the step's expandable detail, so it gets its own category
          const isNote = s.category === 'test.step' && /^note: /.test(title)
          out.push({
            label: (isNote ? title.slice(6) : humanize(s.category, title)).slice(0, 160),
            cat: isNote ? 'info' : s.category,
            depth,
            ok: !s.error,
            ...(at != null && epoch != null
              ? { t: Math.max(0, Math.round(at - epoch)), d: Math.round(s.duration || 0) }
              : {})
          })
        }
      }
      if (s.steps?.length) walk(s.steps, keep && s.category === 'test.step' ? depth + 1 : depth)
    }
  }
  walk(steps, 0)
  // …but a trimmed record SAYS so — a list that just stops reads as "the test ended here"
  if (dropped) {
    out.push({
      label: '… trimmed here — ' + dropped + ' more steps ran (the record keeps the first 80)',
      cat: 'note', depth: 0, ok: true
    })
  }
  return out
}

// Folds each run's results into spec/_results-index.json — the per-screen source of truth the
// board reads. It has to be a REPORTER, not a globalTeardown: Playwright writes the JSON report
// file AFTER teardown, so a teardown that read that file folded nothing. A reporter has the
// results in hand at onEnd and needs no file at all.
//
// It also writes the RECORD manifest: which screenshots and video belong to which TEST. Keyed by
// title, so the board can show a test's own shots under that test row rather than a heap of images
// nobody can attribute. Playwright hands the reporter each test's attachments directly, so this is
// exact — no guessing from folder names.
// Only a test that actually RAN may be recorded. Playwright invokes custom reporters for
// `--list` too — onBegin/onEnd fire with the full suite and ZERO results — and an unexecuted
// test's outcome() is 'skipped', which the ok-check below reads as a FAILURE. Before this guard
// (2026-08-21) a bare `npx playwright test --list` therefore recorded every case as failed-in-0ms,
// folded board-wide fail over the real index, and the poisoned board.html broke the next real
// suite run. An unattempted case is not a failed case: it leaves NO record, so the fold keeps
// whatever honest state stood before (this also stops a run that dies before its first test — or
// a test.skip — from writing fake reds). Pure and exported for tools/reporter-guard.test.mjs.
export const attempted = test => ((test.results || []).length > 0)

// Is ffmpeg on this box? Auto-detected exactly like piper/ffmpeg in the narrate/serve tools —
// probed once, and its ABSENCE is never an error (Task 15 rule: without ffmpeg the frame pair
// alone is the evidence; the clip is a bonus cut only where the recording and the tool both exist).
let FFMPEG
function ffmpegOk () {
  if (FFMPEG !== undefined) return FFMPEG
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = true } catch { FFMPEG = false }
  return FFMPEG
}

// Turn the run's raw evidence harvest ({qid: {before, after, window}} with attachment paths in
// the run's output dir, pruned with it) into durable index entries: copy each frame pair to its
// deterministic home (spec/<screen>/evidence/<rid>.*.png — overwriting is the retention rule) and
// return {qid: entry} for the fold. The WINDOW rides the entry — it is what lets the board's
// frame-stepper (gif mode, Task 13) pace the pair at the assert body's true relative timing; the
// looping webp the window once fed is retired (the stepper plays the frames, so nothing rendered
// the clip). Best-effort throughout — a frame that cannot be copied is dropped, never a failed
// run — and it NEVER creates a screen directory the tree does not have (a stray tag must not
// materialise a screen; the state guard would have nothing to remove because nothing may appear).
// Task 16 #1: commit ONE recording per source file — content-hash named so an identical recording
// re-lands on its own path and a changed one appears beside the old (the fold prunes the orphan).
// Downscaled/re-encoded small when ffmpeg is here (tools/evidence.mjs ffmpegVideoArgs — measured
// ~0.75 MB for a 40s flow); plain-copied otherwise, bigger but honest. Best-effort throughout: a
// failed or timed-out encode removes its partial file and simply leaves the entries video-less.
function commitVideo (srcAbs, screen, cache) {
  const key = screen + ' ' + srcAbs
  if (cache.has(key)) return cache.get(key)
  let rel = null
  try {
    const hash = createHash('sha256').update(readFileSync(srcAbs)).digest('hex').slice(0, 12)
    rel = evidenceVideoPath(screen, hash)
    const dest = join(process.cwd(), rel)
    if (!existsSync(dest)) {
      let landed = false
      if (ffmpegOk()) {
        try {
          execFileSync('ffmpeg', ffmpegVideoArgs(srcAbs, dest), { stdio: 'ignore', timeout: 180000 })
          landed = existsSync(dest)
        } catch {
          try { rmSync(dest, { force: true }) } catch { /* nothing landed */ }
          landed = false
        }
      }
      if (!landed) {
        try { copyFileSync(srcAbs, dest); landed = true } catch { /* dropped, never fatal */ }
      }
      if (!landed) rel = null
    }
  } catch { rel = null }
  cache.set(key, rel)
  return rel
}

function harvestEvidence (harvest, ranAt) {
  const out = {}
  const runId = process.env.BOARD_RECORD ? basename(process.env.BOARD_RECORD) : String(ranAt)
  // Resolve each requirement to its frames + window + (the primary recording's) video. The PRIMARY
  // per screen is the recording COVERING THE MOST requirements — not the last flow to run (the old
  // last-capture count let a shorter composed flow steal it, leaving the comprehensive flow's own
  // beats video-less). resolvePrimaryVideo (tools/evidence.mjs, pure + unit-tested) makes that call,
  // and a shared requirement's window comes from the PRIMARY recording, so the seek indexes the
  // recording actually shown. commitVideo (cached per screen) then writes that one .webm.
  const resolved = resolvePrimaryVideo(harvest)
  const cache = new Map()
  for (const [qid, r] of Object.entries(resolved)) {
    const scr = qid.slice(0, qid.indexOf(':'))
    const rid = qid.slice(qid.indexOf(':') + 1)
    if (!scr || !existsSync(join(process.cwd(), 'spec', scr))) continue
    const paths = evidencePaths(scr, rid)
    try { mkdirSync(join(process.cwd(), paths.dir), { recursive: true }) } catch { continue }
    const entry = { before: null, after: null, window: r.window || null, beats: [], runId, at: new Date(ranAt).toISOString() }
    // ONE frame, landed at its deterministic path: downscaled to the house 1280 width when ffmpeg
    // is here (final review M4 — a full-viewport PNG per phase per beat per fold was megabytes of
    // history), the 1× copy otherwise. Returns whether it landed; never throws.
    const landFrame = (src, destRel) => {
      const dest = join(process.cwd(), destRel)
      if (ffmpegOk()) {
        try {
          execFileSync('ffmpeg', ffmpegDownscaleArgs(src, dest), { stdio: 'ignore', timeout: 15000 })
          if (existsSync(dest)) return true
        } catch { /* fall through to the plain copy */ }
      }
      try { copyFileSync(src, dest); return true } catch { return false }
    }
    // PER BEAT (2026-08-28): each beat of the requirement keeps its own pair, its own layout
    // skeletons — the SOURCE tools/viz.mjs renderWireframe draws that beat's frame from — and its
    // own window, so a per-beat row can show, pace and seek its own proof. Best-effort throughout.
    for (const b of (r.beats || [])) {
      const bp = beatEvidencePaths(scr, rid, b.n)
      const row = { n: b.n, before: null, after: null, layoutBefore: null, layoutAfter: null, window: b.window || null, values: [] }
      for (const phase of ['before', 'after']) {
        if (b[phase] && landFrame(b[phase], bp[phase])) row[phase] = bp[phase]
      }
      for (const key of ['layoutBefore', 'layoutAfter']) {
        if (!b[key]) continue
        // a plain copy: JSON has nothing to re-encode
        try { copyFileSync(b[key], join(process.cwd(), bp[key])); row[key] = bp[key] } catch { /* dropped */ }
      }
      // THE ASSERTED-VALUE FRAMES (2026-08-29): one per value the beat rang and read, landed the same
      // way and in the same order, each carrying `at` — its offset in ms from the moment the beat's
      // `proves` step started, read back out of the skeleton that recorded it (spec/_base.ts
      // snapLayout). That offset is what lets the board anchor the frame INSIDE the beat's own window
      // and play the loop at the run's true relative pace; without a skeleton the frame still shows,
      // untimed, and the loop falls back to equal holds.
      for (const v of (b.values || [])) {
        const vp = valueEvidencePaths(scr, rid, b.n, v.k)
        const got = { k: v.k, frame: null, layout: null, at: null }
        if (v.frame && landFrame(v.frame, vp.frame)) got.frame = vp.frame
        if (v.layout) {
          try { copyFileSync(v.layout, join(process.cwd(), vp.layout)); got.layout = vp.layout } catch { /* dropped */ }
        }
        if (got.layout) {
          try {
            // …and the NAME of the moment beside its offset (the human, 2026-09-02): the assertion's
            // own label, so the row's ONE stepper can say what each segment IS instead of "when 1".
            // Lifted by the pure valueMeta (tools/evidence.mjs) — a skeleton that carries neither
            // yields neither, and the board falls back to a generic name and equal holds.
            const meta = valueMeta(JSON.parse(readFileSync(join(process.cwd(), got.layout), 'utf8')))
            if (typeof meta.at === 'number') got.at = meta.at
            if (meta.label) got.label = meta.label
          } catch { /* an unreadable skeleton — the frame simply plays untimed and unnamed */ }
        }
        if (got.frame) row.values.push(got)
      }
      // THE FOCUS RECT: where the ring stood when this beat was proven, read back out of the layouts
      // that already recorded it (tools/evidence.mjs focusFromLayouts) — the board zooms the media
      // onto it. No cropped file is ever written; the zoom is a view over the frame. It spans EVERY
      // phase of the beat (2026-08-29), not the after-frame alone: the value the When typed and the
      // value the Then produced are usually different elements, and a camera on the last of them
      // crops the rest of the beat out of the row on both sides. The union is one rect, so the row
      // still has exactly one camera (board R19).
      const rings = [row.layoutAfter, ...row.values.map(v => v.layout)].filter(Boolean).map(p => {
        try { return JSON.parse(readFileSync(join(process.cwd(), p), 'utf8')) } catch { return null }
      })
      if (rings.length) {
        try {
          const f = focusFromLayouts(rings)
          if (f) row.focus = f
        } catch { /* no ring, or an unreadable skeleton — the beat simply carries no zoom */ }
      }
      if (row.before || row.after || row.layoutBefore || row.layoutAfter || row.values.length) entry.beats.push(row)
    }
    // …and the REQUIREMENT-LEVEL pair every existing reader still consumes (the cover, the Focus
    // media pane, the frame-stepper): the first beat's before and the last beat's after, at the
    // unchanged <rid>.before.png / <rid>.after.png so nothing downstream moves. Copied from the
    // beat frames that already landed — same bytes, one downscale instead of two.
    const first = entry.beats.find(b => b.before)
    const last = [...entry.beats].reverse().find(b => b.after)
    for (const [phase, from] of [['before', first && first.before], ['after', last && last.after]]) {
      if (from) {
        try { copyFileSync(join(process.cwd(), from), join(process.cwd(), paths[phase])); entry[phase] = paths[phase] } catch { /* dropped */ }
      } else if (r[phase] && landFrame(r[phase], paths[phase])) {
        entry[phase] = paths[phase]     // no beat frame landed, but the run captured one — keep it
      }
    }
    if (!(entry.before || entry.after)) continue
    // Task 16 #1: commit the screen's PRIMARY recording to spec/<screen>/evidence/<hash>.webm and
    // point this entry at it with the seek offsets (this entry's own window, frozen from the primary
    // recording) — the reader seeks to `from` so video mode opens at THIS requirement's moment. A
    // requirement the primary did not cover has r.srcVideo null and stays video-less (button hidden);
    // a CLI run resolves everything to '_novideo', so this is a no-op and the fold's carry keeps
    // whatever stands committed. Best-effort: a failed encode leaves the entry video-less.
    if (r.srcVideo) {
      const rel = commitVideo(r.srcVideo, scr, cache)
      if (rel) entry.video = { path: rel, from: entry.window ? entry.window.from : null, to: entry.window ? entry.window.to : null }
    }
    out[qid] = entry
  }
  return out
}

// DERIVE THE SCHEMATICS AT EVERY FOLD (2026-09-02). The drawing beside a requirement is drawn from
// the harvest's layout skeletons — so it is a BY-PRODUCT OF THIS RUN, exactly like the frames, and
// it has to land with them. It did not: `node tools/viz-derive.mjs` was a by-hand command, so every
// run left the committed drawings made from the PREVIOUS geometry — the demo's ring, dim wash and
// callout had silently vanished from every schematic, and their cardspots were empty, which
// un-frames the callout on the proof side too. Now the fold spawns the viz pass for the screens it
// just folded.
//
// A child process, never an import: viz-derive is a top-level script, and the reporter must not take
// on spec-store's module state (the same reason the server spawns build()). Bounded, and swallowed —
// a drawing is not proof, so a derive that fails is logged and the run stands (rule 3 cuts the other
// way here: never fake a green, and never fake a RED either).
//
// Pure seam, exported for tools/reporter-derive.test.mjs: `exec` is execFileSync in production.
const VIZ_DERIVE = fileURLToPath(new URL('../tools/viz-derive.mjs', import.meta.url))
export function deriveSchematics (screens, exec) {
  // `_`-prefixed pseudo-screens (the auth setup file) are not rows and have no drawings
  const list = [...new Set((screens || []).map(String).filter(s => s && !s.startsWith('_')))]
  if (!list.length) return false
  try {
    exec(process.execPath, [VIZ_DERIVE, ...list], { stdio: 'inherit', timeout: 120000 })
    return true
  } catch (err) {
    console.error('schematic derive failed:', (err && err.message) || err)
    return false
  }
}

export default class ResultsIndexReporter {
  onBegin (_config, suite) { this.suite = suite }

  onEnd () {
    if (!this.suite) return
    const byScreen = {}
    const shotsByTest = {}
    const evidenceHarvest = {}   // qid → {before, after, window, video} raw paths, folded run-wide
    let totalMs = 0
    // a stable stamp for "when this run happened", so a pass can later be checked against what has
    // changed since — reporters run in a normal node process, so the clock is available here
    const ranAt = Date.now()
    for (const test of this.suite.allTests()) {
      if (!attempted(test)) continue   // never ran (a --list, an aborted boot, a skip) — no record
      const file = String(test.location?.file || '')
      const rel = file.split('/spec/')[1]
      if (!rel) continue
      const screen = rel.split('/')[0]
      const ok = test.outcome() === 'expected' || test.outcome() === 'flaky'
      const ms = Math.round((test.results || []).reduce((n, r) => n + (r.duration || 0), 0))
      totalMs += ms
      const error = ok ? null
        : String((test.results || []).find(r => r.error)?.error?.message || '').slice(0, 400)
      // R8: each case keeps its OWN log — a self-contained record leading with what the case was and
      // how it ended, then anything it printed and the FULL (untruncated) failure. "which one, and
      // what did it actually say" is answerable from the case itself, not a folded pass/fail. The
      // committed index keeps only the short `error` headline; this full text lives in the per-run
      // record, pruned with the run, exactly like the steps.
      const stdout = (test.results || []).flatMap(r => r.stdout || []).map(String).join('')
      const stderr = (test.results || []).flatMap(r => r.stderr || []).map(String).join('')
      const errFull = (test.results || []).map(r => r.error).filter(Boolean)
        .map(e => String(e.message || '') + (e.stack ? '\n' + String(e.stack) : '')).join('\n\n')
      const caseLogFull = [
        test.title,
        (ok ? '✓ passed' : '✗ failed') + ' · ' + ms + 'ms',
        stdout && '\n--- stdout ---\n' + stdout,
        stderr && '\n--- stderr ---\n' + stderr,
        errFull && '\n--- error ---\n' + errFull
      ].filter(Boolean).join('\n')
      // Bounded, and it SAYS when it cut. Every case of every run now keeps a log, so an unbounded
      // one would grow the run log without limit; a silent truncation would be worse than the cap,
      // because a log that stops mid-error reads like the error stopped there.
      const caseLog = caseLogFull.length > 8000
        ? caseLogFull.slice(0, 8000) + '\n\n… truncated at 8000 characters'
        : caseLogFull
      // Per-requirement coverage (R4/R5): which requirement ids this test tagged, each pass / fail /
      // not-reached, read from its `proves <id>` steps and `covers` annotation. Bare ids are
      // qualified to THIS test's screen; a qualified id (`asset-plan:R5`) proves another screen's
      // requirement. Kept on the committed index (small — ids and a word each), because the board's
      // left column derives each requirement's proven state from it, folded across every screen.
      const reqs = coverageFromTest({
        steps: (test.results || []).slice(-1)[0]?.steps,
        annotations: test.annotations || [],
        screen
      })
      const prev = byScreen[screen]
      byScreen[screen] = {
        total: (prev?.total || 0) + 1,
        failed: (prev?.failed || 0) + (ok ? 0 : 1),
        tests: [...(prev?.tests || []), { title: test.title, ok, ms, error, line: test.location?.line, reqs }],
        ranAt
      }
      // the images and video Playwright captured for THIS test, as repo-relative paths the static
      // server can load (the reporter runs with cwd = repo root)
      const atts = (test.results || []).flatMap(r => r.attachments || [])
      // The LAST page only. A watched run keeps one window open for the whole suite by holding a
      // keepalive page that is never driven anywhere; Playwright screenshots every page in the
      // context, so that blank page was being filed under "what this test saw" ahead of the real
      // one. The page a test actually worked in is the last one it opened.
      // Evidence frames are per-REQUIREMENT material, not "what this test saw" — keep them out of
      // the cover/shots selection or a checkReq's after-frame would displace the real cover.
      const allShots = atts.filter(a => /\.png$/i.test(a.path || '') && !parseEvidenceAttachment(a.name))
        .map(a => relative(process.cwd(), a.path))
      const shots = allShots.slice(-1)
      const video = atts.find(a => /\.webm$/i.test(a.path || ''))
      // The DETAIL STEPS of the case — every action and check Playwright ran, in order and nested,
      // so a test case can be expanded to see exactly what it did. Verbose, so it lives in the
      // per-run record (pruned with the run), never in the committed index.
      const steps = flattenSteps((test.results || []).slice(-1)[0]?.steps)
      // EVIDENCE HARVEST (Task 15, D2): pick up the before/after phase pair checkReq attached for
      // each requirement, plus the proves-step's window off the recorded step times (t/d —
      // Playwright already stamped them; no re-clocking) — the window is the stepper's timing base
      // (Task 13), not a cut input any more. Qualified to the requirement's screen with the SAME
      // rule coverage uses, so an `x:R3` tag's evidence lands on screen x. Folded run-wide: the
      // last capture of a requirement wins.
      const winCache = {}
      for (const a of atts) {
        const tag = parseEvidenceAttachment(a.name)
        // …and the LAYOUT skeleton of the same phase (2026-08-28): the same id, the same beat, the
        // same capture, folded onto the same per-recording entry so the schematic is drawn from the
        // geometry of the frames it is shown beside.
        const lay = tag ? null : parseLayoutAttachment(a.name)
        if ((!tag && !lay) || !a.path) continue
        const t = tag || lay
        const qid = qualify(t.id, screen)
        // captures are kept PER recording (not last-wins): resolvePrimaryVideo then picks each
        // screen's primary as the recording COVERING THE MOST requirements — so a shorter flow that
        // reran a few shared beats last cannot steal it from the comprehensive flow that proved
        // everything (which had left its screen-only reqs video-less). Only a board run records
        // video, so a CLI run's captures land under '_novideo' and the committed video rides the fold's carry.
        const h = (evidenceHarvest[qid] ||= { caps: {} })
        const key = (video && video.path) ? video.path : '_novideo'
        const cap = (h.caps[key] ||= { srcVideo: (video && video.path) || null, beats: {}, order: [] })
        // …and PER BEAT inside that capture. An un-keyed name (an older run) folds as beat 1.
        const n = t.beat || 1
        if (!cap.beats[n]) { cap.beats[n] = {}; cap.order.push(n) }
        const slot = cap.beats[n]
        // an ASSERTED-VALUE phase (2026-08-29) — `v<k>`, the k-th value proveVisible rang and read
        // inside this beat. Kept in its own numbered map so the beat's proof can play
        // before → each value → after; first-wins per k for the same reason the pair is.
        const vk = /^v(\d+)$/.exec(String(t.phase))
        if (vk) {
          const k = Number(vk[1])
          const vslot = ((slot.values ||= {})[k] ||= {})
          const field = tag ? 'frame' : 'layout'
          if (!vslot[field]) vslot[field] = a.path
          h.latestKey = key
          continue
        }
        // FIRST-wins per beat, never last: a chain checked more times than it has beats clamps its
        // extra checks onto the final beat (R5's "count climbs back" is its beats' third check), and
        // letting those overwrite showed a beat's row proving a DIFFERENT check than its Then text —
        // "To do reads 4" beside frames reading 5. The storyboard beat is the first check that
        // performs it; later same-beat checks still count for coverage, their frames are extra.
        if (tag) { if (!slot[tag.phase]) slot[tag.phase] = a.path }
        else { const f = lay.phase === 'before' ? 'layoutBefore' : 'layoutAfter'; if (!slot[f]) slot[f] = a.path }
        // this BEAT's own span in the recording: the k-th `proves <id>` step of the test is the
        // k-th checkReq call, which is the k-th beat this capture saw (the step NAME is untouched —
        // coverage still derives from it). First-wins here too, same reason as the frames.
        const wins = (winCache[qid] ||= clipWindows(steps, qid))
        const k = cap.order.indexOf(n)
        if (!slot.window) slot.window = wins[k] || wins[wins.length - 1] || null
        h.latestKey = key
      }
      // Always record the case — every case now carries at least its own log, even one with no shots,
      // no video and no steps, so "each test case has its own record" holds for every case.
      shotsByTest[test.title] = {
        shots, video: video ? relative(process.cwd(), video.path) : null, steps, log: caseLog,
        // What a log needs to be worth keeping ten of: when it ran, how long it took, whether it
        // passed, and the commit it ran against — so a case going red can be tied to a change.
        at: new Date(ranAt).toISOString(), ms, ok, commit: COMMIT
      }
    }
    if (Object.keys(byScreen).length) {
      // BOARD_PARTIAL is set by the server when it filtered the run to a subset — then this
      // report describes only the tests that ran, and the rest must keep their existing results.
      const partial = !!process.env.BOARD_PARTIAL
      // The evidence folds in the SAME read-modify-write as the results (fold, never replace): a
      // requirement this run proved gets its fresh frames + window; one it did not touch keeps its
      // existing evidence. Harvest first (copies + optional clip cuts), fold second.
      let evidence = {}
      try { evidence = harvestEvidence(evidenceHarvest, ranAt) } catch (err) { console.error('evidence harvest failed:', err) }
      try { foldByScreen(byScreen, { partial, evidence }) } catch (err) { console.error('results-index fold failed:', err) }
      // …and the DRAWINGS from that same harvest, so the schematic beside a requirement is never a
      // pass behind the frames beside it. Deterministic output: a re-derive whose geometry did not
      // move rewrites nothing (viz-derive compares bodies).
      deriveSchematics(Object.keys(byScreen), execFileSync)

      // Record a "recent runs" entry — but ONLY when the SERVER did not start this run. A board-started
      // run sets BOARD_RECORD and the server writes a richer entry itself (with per-test shots), so
      // recording here too would double it. A plain `npm run e2e` or the crawl's own test run sets no
      // BOARD_RECORD, and without this their runs never appear in the log at all — which is exactly the
      // "the run record is not saved" gap. `_`-prefixed pseudo-screens (e.g. the auth setup file) are
      // not real rows, so they never name the run.
      if (!process.env.BOARD_RECORD) {
        const screens = Object.keys(byScreen).filter(s => !s.startsWith('_'))
        const total = Object.values(byScreen).reduce((n, r) => n + r.total, 0)
        const failed = Object.values(byScreen).reduce((n, r) => n + r.failed, 0)
        try {
          recordRunEntry({
            at: new Date(ranAt).toISOString(),
            screen: screens.length === 1 ? screens[0] : 'all',
            ms: totalMs,
            total,
            failed,
            ok: failed === 0,
            runId: String(ranAt),
            // The per-case records, from a CLI run too. This used to be {}, which meant a case only
            // ever had steps and a log if the BOARD happened to have run it — so running the whole
            // suite the normal way left every case blank, and a screen showed detail for the one
            // case somebody had clicked Run on. Screenshots genuinely do not exist here (they are
            // only captured for a board-started run, which is what asks for a record directory), so
            // this carries the steps and the log and no pictures.
            shotsByTest: Object.fromEntries(Object.entries(shotsByTest)
              .map(([t, v]) => [t, { ...v, shots: [], video: null }])),
            archive: null
          })
        } catch (err) { console.error('run-history record failed:', err) }
      }
    }
    // The manifest lives in the run's own record directory, so it is pruned with the run it
    // describes and never outlives its images.
    if (process.env.BOARD_RECORD) {
      // mkdir first: a run that produced no artifacts (a no-match grep) never created the dir, and
      // a sibling's prune once swept a live dir mid-run — the manifest is worth a recreate either way.
      try {
        mkdirSync(process.env.BOARD_RECORD, { recursive: true })
        writeFileSync(join(process.env.BOARD_RECORD, 'shots.json'), JSON.stringify(shotsByTest))
      } catch (err) { console.error('shots manifest write failed:', err) }
    }
  }
}
