import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { foldByScreen, recordRunEntry, DATA_HOME } from '../tools/spec-store.mjs'
import { putBlob, openStore } from '../tools/store.mjs'
import { coverageFromTest, qualify } from '../tools/coverage.mjs'
import { clipWindows, ffmpegDownscaleArgs, deriveFacesCss, parseEvidenceAttachment, parseLayoutAttachment, parseReplicaAttachment, parseFontAttachment, parseFontFacesAttachment, focusFromLayouts, valueMeta, valueLanded, claimSlot, ffmpegVideoArgs, resolvePrimaryVideo, qidOfKey } from '../tools/evidence.mjs'
// what a landed replica says about itself (phase 3, 2026-09-03): how many gaps the in-page gate
// found, and whether it was gated at all. One reader, shared with `npm run proof mirror`.
import { replicaNote } from '../tools/replica-gate.mjs'

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

// ONE WAY IN (the data home, 2026-09-05/06): bytes → a BLOB, and the src it returns is both what the
// row keeps and the URL the board asks for. Nothing is copied into `spec/<screen>/evidence/` any
// more — an unchanged frame re-lands on its own content address for free, and a frame no retained
// row names is collected at the fold (tools/store.mjs gcBlobs) instead of being pruned by path.
// Best-effort throughout, exactly as the copies were: a file that will not land is dropped, never a
// failed run.
const land = async (srcAbs, ext) => {
  try { return await putBlob(DATA_HOME, readFileSync(srcAbs), ext || extname(srcAbs).slice(1) || 'bin') } catch { return null }
}
// what a landed file SAYS — read from the source the run just wrote, not from the blob it became:
// the bytes are the same and this way the fold reads each moment exactly once (and reads nothing at
// all through a bucket in cloud mode).
const readText = p => { try { return readFileSync(p, 'utf8') } catch { return null } }
let tmpSeq = 0
const tmpFile = ext => join(tmpdir(), `sb-${process.pid}-${Date.now()}-${tmpSeq++}.${ext}`)

// ONE frame, landed as a blob: downscaled to the house 1280 width when ffmpeg is here (final review
// M4 — a full-viewport PNG per phase per beat per fold was megabytes of history), the 1× bytes
// otherwise. Returns the src or null; never throws.
async function landFrame (srcAbs) {
  if (ffmpegOk()) {
    const tmp = tmpFile('png')
    try {
      execFileSync('ffmpeg', ffmpegDownscaleArgs(srcAbs, tmp), { stdio: 'ignore', timeout: 15000 })
      if (existsSync(tmp)) {
        const rel = await land(tmp, 'png')
        try { rmSync(tmp, { force: true }) } catch { /* already gone */ }
        if (rel) return rel
      }
    } catch { try { rmSync(tmp, { force: true }) } catch { /* nothing landed */ } }
  }
  return land(srcAbs, 'png')
}

// Task 16 #1: keep ONE recording per source file — re-encoded small when ffmpeg is here
// (tools/evidence.mjs ffmpegVideoArgs — measured ~0.75 MB for a 40s flow), landed as-is otherwise.
// Content-addressed like everything else, so the identical recording re-lands on itself and a
// changed one is simply a different blob (the old one is collected once no row names it). Cached per
// screen+source so one recording is encoded once per fold. Best-effort: a failed or timed-out encode
// removes its partial file and leaves the entries video-less.
async function commitVideo (srcAbs, screen, cache) {
  const key = screen + '\x00' + srcAbs
  if (cache.has(key)) return cache.get(key)
  let rel = null
  if (ffmpegOk()) {
    const tmp = tmpFile('webm')
    try {
      execFileSync('ffmpeg', ffmpegVideoArgs(srcAbs, tmp), { stdio: 'ignore', timeout: 180000 })
      if (existsSync(tmp)) rel = await land(tmp, 'webm')
    } catch { /* fall through to the plain landing */ }
    try { rmSync(tmp, { force: true }) } catch { /* already gone */ }
  }
  if (!rel) rel = await land(srcAbs, 'webm')
  cache.set(key, rel)
  return rel
}

// Turn the run's raw harvest into durable rows: land every frame, skeleton, replica, face and
// recording as a blob and return `{<test file> <qid>: entry}` for the fold. The WINDOW rides the
// entry — it is what lets the board's frame-stepper pace a beat at the assert body's true relative
// timing. It NEVER creates a screen directory the tree does not have (a stray tag must not
// materialise a screen).
//
// THE KEY CARRIES THE TEST (the human's C2 ruling, 2026-09-06). Evidence used to be keyed by
// REQUIREMENT alone, so a composed flow proving another screen's requirement overwrote the home
// screen's harvest of it — the collision the I5 precedence rule and the `foreign` marker refereed.
// Both are gone: the flow's harvest and the home screen's are two rows, and the reader merges them
// with the home screen's own test headlining (tools/spec-store.mjs mergeEvidenceRows).
export async function harvestEvidence (harvest, ranAt) {
  const out = {}
  // EVERY GAPPED MOMENT OF THIS RUN, said out loud at the fold (phase 3). A replica that stopped
  // looking like the app is exactly the defect the drawing's mirror guard exists for, and the fold is
  // where a person is watching. Bounded like every other line the reporter prints.
  const gapLines = []
  const runId = process.env.BOARD_RECORD ? basename(process.env.BOARD_RECORD) : String(ranAt)
  // Resolve each requirement to its frames + window + (the primary recording's) video. The PRIMARY
  // per screen is the recording COVERING THE MOST requirements — not the last flow to run (the old
  // last-capture count let a shorter composed flow steal it, leaving the comprehensive flow's own
  // beats video-less). resolvePrimaryVideo (tools/evidence.mjs, pure + unit-tested) makes that call,
  // and a shared requirement's window comes from the PRIMARY recording, so the seek indexes the
  // recording actually shown. commitVideo (cached per screen) then lands that one .webm.
  const resolved = resolvePrimaryVideo(harvest)
  const cache = new Map()
  for (const [key, r] of Object.entries(resolved)) {
    const qid = qidOfKey(key)
    const scr = qid.slice(0, qid.indexOf(':'))
    const rid = qid.slice(qid.indexOf(':') + 1)
    if (!scr || !existsSync(join(process.cwd(), 'spec', scr))) continue
    const entry = {
      before: null,
      after: null,
      window: r.window || null,
      beats: [],
      runId,
      at: new Date(ranAt).toISOString(),
      // who filed it (C2) — the fold keys the row on this, so two tests proving one requirement are
      // two rows and neither can quietly stand in for the other
      testFile: r.testFile || `spec/${scr}/test.spec.ts`,
      testTitle: r.testTitle || null
    }
    // PER BEAT (2026-08-28): each beat of the requirement keeps its own pair, its own layout
    // skeletons — what the gate checks its picture against — and its own window, so a per-beat row
    // can show, pace and seek its own proof. Best-effort throughout.
    for (const b of (r.beats || [])) {
      const row = { n: b.n, before: null, after: null, layoutBefore: null, layoutAfter: null, replicaExpectedBefore: null, replicaExpectedAfter: null, window: b.window || null, values: [] }
      for (const phase of ['before', 'after']) {
        if (!b[phase]) continue
        const rel = await landFrame(b[phase])
        if (rel) row[phase] = rel
      }
      const layText = {}
      for (const key2 of ['layoutBefore', 'layoutAfter']) {
        if (!b[key2]) continue
        layText[key2] = readText(b[key2])
        const rel = await land(b[key2], 'json')      // JSON has nothing to re-encode
        if (rel) row[key2] = rel
      }
      // …and the ONE REPLICA of each end of the beat (2026-09-04): the app's own sanitised DOM with
      // this beat's claims applied, landed as it was captured — re-encoding the picture the Expected
      // view is built from is exactly how a mirror drifts. The gate's verdict on the UNEDITED tree
      // rides on its root.
      const repText = {}
      for (const key2 of ['replicaExpectedBefore', 'replicaExpectedAfter']) {
        if (!b[key2]) continue
        repText[key2] = readText(b[key2])
        const rel = await land(b[key2], 'html')
        if (rel) row[key2] = rel
      }
      // …and WHAT THE GATE FOUND, read off the very bytes that just landed (phase 3): the beat's
      // resting moment is what the row shows, so that is the one the fold records and reports.
      noteReplica(row, repText.replicaExpectedAfter, gapLines, scr, rid, b.n, 'after')
      // …and the beat's OPENING moment is reported too (fix round 1, M2): a gapped before-frame used
      // to say nothing at the fold and only surface later in the CLI. The beat's own verdict stays
      // the resting moment's — that is the one the row shows.
      noteReplica(null, repText.replicaExpectedBefore, gapLines, scr, rid, b.n, 'before')
      // …and where the RESTING moment has NO PICTURE at all (a moment whose ringed element the walk
      // refused to measure lands none — spec/_moment.mjs), the row's verdict comes from the last
      // moment of the beat that DOES have one rather than from nothing.
      if (!row.gate && row.replicaExpectedBefore) {
        noteReplica(row, repText.replicaExpectedBefore, [], scr, rid, b.n, 'before')
      }
      // THE ASSERTED-VALUE FRAMES (2026-08-29): one per value the beat rang and read, landed the same
      // way and in the same order, each carrying `at` — its offset in ms from the moment the beat's
      // `proves` step started, read back out of the skeleton that recorded it (spec/_base.ts
      // snapLayout). That offset is what lets the board anchor the frame INSIDE the beat's own window
      // and play the loop at the run's true relative pace; without a skeleton the frame still shows,
      // untimed, and the loop falls back to equal holds.
      const valueLayouts = []
      for (const v of (b.values || [])) {
        const got = { k: v.k, frame: null, layout: null, replicaExpected: null, at: null }
        if (v.frame) {
          const rel = await landFrame(v.frame)
          if (rel) got.frame = rel
        }
        let vlay = null
        if (v.layout) {
          vlay = readText(v.layout)
          const rel = await land(v.layout, 'json')
          if (rel) got.layout = rel
        }
        let vrep = null
        if (v.replicaExpected) {
          vrep = readText(v.replicaExpected)
          const rel = await land(v.replicaExpected, 'html')
          if (rel) got.replicaExpected = rel
        }
        noteReplica(got, vrep, gapLines, scr, rid, b.n, 'v' + v.k)
        if (vlay) {
          try {
            const parsed = JSON.parse(vlay)
            valueLayouts.push(parsed)
            // …and the NAME of the moment beside its offset (the human, 2026-09-02): the assertion's
            // own label, so the row's ONE stepper can say what each segment IS instead of "when 1".
            // Lifted by the pure valueMeta (tools/evidence.mjs) — a skeleton that carries neither
            // yields neither, and the board falls back to a generic name and equal holds.
            const meta = valueMeta(parsed)
            if (typeof meta.at === 'number') got.at = meta.at
            if (meta.label) got.label = meta.label
            // …and the CLAIM it made (the human, 2026-09-02): what the assertion asked for beside
            // what the page gave it. The Expected shows the intended value on a moment the app
            // failed — the picture is the intent, the photograph is what happened — so it has to
            // survive the fold. Lifted whole or not at all (valueMeta claimOf).
            if (meta.claim) got.claim = meta.claim
            // …and whether this moment's PHOTOGRAPH landed at all (task 3b, item 5, 2026-09-04).
            // The shot is bounded so a slow page costs the bound and never the run; when it is
            // reached the frame is missing and the moment used to VANISH from the fold, taking its
            // replica with it and reddening every beat that needs a claimed specimen, with nothing
            // anywhere saying why. The moment is what the run MEASURED, so it stays — marked.
            if (meta.dropped) got.dropped = true
          } catch { /* an unreadable skeleton — the frame simply plays untimed and unnamed */ }
        }
        if (valueLanded(got)) row.values.push(got)
        if (got.dropped) gapLines.push(`evidence drop · ${scr} ${rid} b${b.n} v${v.k} · the page would not photograph this moment; its measurement and its replica are kept`)
      }
      // THE FOCUS RECT: where the ring stood when this beat was proven, read out of the skeletons
      // that already recorded it (tools/evidence.mjs focusFromLayouts) — the board zooms the media
      // onto it. No cropped file is ever written; the zoom is a view over the frame. It spans EVERY
      // phase of the beat (2026-08-29), not the after-frame alone: the value the When typed and the
      // value the Then produced are usually different elements, and a camera on the last of them
      // crops the rest of the beat out of the row on both sides. The union is one rect, so the row
      // still has exactly one camera (board R19).
      const rings = []
      if (layText.layoutAfter) { try { rings.push(JSON.parse(layText.layoutAfter)) } catch { /* unreadable */ } }
      for (const l of valueLayouts) rings.push(l)
      if (rings.length) {
        try {
          const f = focusFromLayouts(rings)
          if (f) row.focus = f
        } catch { /* no ring, or an unreadable skeleton — the beat simply carries no zoom */ }
      }
      if (row.before || row.after || row.layoutBefore || row.layoutAfter || row.values.length) entry.beats.push(row)
    }
    // …and the REQUIREMENT-LEVEL pair every existing reader still consumes (the cover, the Focus
    // media pane, the frame-stepper): the first beat's before and the last beat's after. Content
    // addressing makes this FREE — the same bytes are the same blob, so the pair is the beat frames'
    // own srcs rather than a second copy of them under another name.
    const first = entry.beats.find(b => b.before)
    const last = [...entry.beats].reverse().find(b => b.after)
    if (first) entry.before = first.before
    if (last) entry.after = last.after
    for (const [phase, from] of [['before', entry.before], ['after', entry.after]]) {
      if (from || !r[phase]) continue
      const rel = await landFrame(r[phase])       // no beat frame landed, but the run captured one
      if (rel) entry[phase] = rel
    }
    if (!(entry.before || entry.after)) continue
    // THE SCREEN'S WEB FONTS (2026-09-03): the faces the replica is set in, landed as blobs so many
    // requirements of one screen share one file by content. A face that will not land is simply not
    // recorded — the replica then renders in the fallback stack, which is honest, not a fake green.
    const faces = []
    for (const f of (r.fonts || [])) {
      if (!f || !f.src) continue
      const rel = await land(f.src, f.ext)
      if (rel && !faces.some(x => x.path === rel)) faces.push({ hash: f.hash || '', ext: f.ext || '', family: f.family || '', url: f.url || '', path: rel })
    }
    if (faces.length) entry.fonts = faces
    // …and the ONE SHEET that DECLARES them (phase 4a): the readable @font-face rules of this page,
    // with every `url(...)` rewritten to the blob beside it, so an opaque-origin srcdoc iframe can
    // set the replica in the app's own type. A rule naming a face that did not fetch is dropped by
    // deriveFacesCss — a browser would 404 it and fall back silently, which is a picture of a
    // different app. The sheet is a blob too, so it sits in the same directory as the faces it names
    // and one relative url is right in either store.
    const facesCss = deriveFacesCss(r.fontFaceRules || [], faces)
    if (facesCss) {
      try { entry.fontFaces = await putBlob(DATA_HOME, Buffer.from(facesCss + '\n'), 'css') } catch { /* dropped, never fatal */ }
    }
    if (r.srcVideo) {
      const rel = await commitVideo(r.srcVideo, scr, cache)
      if (rel) entry.video = { path: rel, from: entry.window ? entry.window.from : null, to: entry.window ? entry.window.to : null }
    }
    out[key] = entry
  }
  // the gapped moments of this run — and the dropped photographs beside them (task 3b, item 5) — at
  // most 12 of them and then the count: one line each, naming the file, the kind and where on the
  // page it stood
  for (const line of gapLines.slice(0, 12)) console.log(line)
  if (gapLines.length > 12) console.log(`…and ${gapLines.length - 12} more replica gap(s) / dropped frame(s)`)
  return out
}

// ONE LANDED REPLICA'S VERDICT, kept on the folded moment as `gate: { gaps, gated, pin, trunc,
// phase }` — small, derived, and enough for a reader of the row to see whether its picture was ever
// checked. Never throws: a replica that will not read is simply not noted.
//
// It takes the replica's own TEXT (2026-09-06, the data home): the fold has those bytes in hand from
// the moment it lands them, and a blob has no path to re-read — in cloud mode re-reading would mean
// fetching back what this process just uploaded.
//
// THE FIELD IS `gate`, NOT `replica` (fix round 1, C1 — the brief's own name). At a VALUE moment
// `replica` is already the picture's own src, so writing the verdict there replaced the src with an
// object — and the fold's keep-set then failed to find that src among the entry's references.
export function noteReplica (row, html, gapLines, screen, id, beat, phase) {
  if (!html) return
  try {
    const note = replicaNote(String(html))
    // THE WHOLE VERDICT, not just the counts (2026-09-04, the review's C1). The board's stale banner
    // names two reasons that are properties of this FILE — the pin it was gated against, so a later
    // build can see the harvest move past it, and a capture that ran out of bytes. Recording only
    // {gaps, gated} left both of them dead wire in tools/build-board.mjs, with a board test that
    // forced the attribute by hand and went green over it.
    // …and WHICH MOMENT the verdict is about (2026-09-04): a beat whose resting moment has no picture
    // takes its verdict from the last one that does, and the board's stale check has to compare that
    // pin against THAT moment's skeleton or the row reads "the app moved past the picture" for ever.
    if (row) row.gate = { gaps: note.gaps, gated: note.gated, pin: note.pin, trunc: note.trunc, phase: String(phase || '').split(' ')[0] }
    for (const g of note.list) {
      gapLines.push(`replica gap · ${screen} ${id} b${beat} ${phase} · ${g.kind} ${g.what} at ${g.x},${g.y} ${g.w}×${g.h}`)
    }
  } catch { /* an unreadable replica is not a verdict */ }
}

// THE SKETCH DERIVE IS GONE (retired by the human, 2026-09-05). The fold used to spawn
// tools/viz-derive.mjs for every screen it had just folded, so a committed drawing was always made
// from the harvest beside it. There is no drawing to make: an un-harvested requirement shows its
// Given/When→Then words and an honest "no Expected yet", and a harvested one's Expected picture is
// the HTML replica the capture already wrote beside its frames. `screensToDraw` and
// `deriveSchematics` went with it, and so did tools/reporter-derive.test.mjs, which pinned exactly
// the child-process call this comment describes.

export default class ResultsIndexReporter {
  onBegin (_config, suite) { this.suite = suite }

  async onEnd () {
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
      // …AND THEY LAND AS BLOBS TOO (the data home, 2026-09-05/06). A run's record used to name
      // files inside its own directory under spec/_runs/<id>/, which the board then served; the
      // record dir is scratch now (it is pruned with the run) and what the record KEEPS is a src,
      // gc'd by reference the moment the run falls off the capped log.
      const allShots = atts.filter(a => /\.png$/i.test(a.path || '') && !parseEvidenceAttachment(a.name))
      const shots = (await Promise.all(allShots.slice(-1).map(a => land(a.path, 'png')))).filter(Boolean)
      const videoAtt = atts.find(a => /\.webm$/i.test(a.path || ''))
      const video = videoAtt ? { path: videoAtt.path, src: await land(videoAtt.path, 'webm') } : null
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
      // THE WEB FONTS this test fetched (2026-09-03), collected before the frames so every
      // requirement the test harvested can name them: they are per PAGE, not per requirement, and
      // the fold commits each face once per screen. Content-named by the harness, so a face already
      // committed lands on itself.
      const testFonts = []
      for (const a of atts) {
        const f = parseFontAttachment(a.name)
        if (!f || !a.path) continue
        const ext = (extname(a.path) || '').replace(/^\./, '').toLowerCase()
        if (!ext) continue
        // the SOURCE URL rides with the face since phase 4a — deriveFacesCss needs it to rewrite the
        // rule that names it; a record from before this carries none and simply matches no rule
        if (!testFonts.some(x => x.hash === f.hash)) testFonts.push({ hash: f.hash, family: f.family, ext, src: a.path, ...(f.url ? { url: f.url } : {}) })
      }
      // …and the RULES the capture could read, per moment, unioned per test (phase 4a). Deduped by
      // rule text: every moment of a page declares the same handful of faces, and the sheet the fold
      // writes is one per screen.
      const testFaces = []
      const seenFace = new Set()
      for (const a of atts) {
        if (!parseFontFacesAttachment(a.name) || !a.path) continue
        let list = null
        try { list = JSON.parse(readFileSync(a.path, 'utf8')) } catch { list = null }
        for (const r of (Array.isArray(list) ? list : [])) {
          const cssText = r && typeof r.cssText === 'string' ? r.cssText : ''
          if (!cssText || seenFace.has(cssText)) continue
          seenFace.add(cssText)
          testFaces.push({ cssText, urls: Array.isArray(r.urls) ? r.urls.map(String) : [] })
        }
      }
      const fontedQids = new Set()
      for (const a of atts) {
        const tag = parseEvidenceAttachment(a.name)
        // …and the LAYOUT skeleton of the same phase (2026-08-28): the same id, the same beat, the
        // same capture, folded onto the same per-recording entry so the schematic is drawn from the
        // geometry of the frames it is shown beside.
        const lay = tag ? null : parseLayoutAttachment(a.name)
        // …and the ACTUAL REPLICA of that same moment (2026-09-03): the app's own sanitised DOM, the
        // picture the board's Expected view is built from. Named and folded exactly like the pair
        // above, so the three always describe one capture of one moment.
        const rep = (tag || lay) ? null : parseReplicaAttachment(a.name)
        if ((!tag && !lay && !rep) || !a.path) continue
        const t = tag || lay || rep
        const qid = qualify(t.id, screen)
        // captures are kept PER recording (not last-wins): resolvePrimaryVideo then picks each
        // screen's primary as the recording COVERING THE MOST requirements — so a shorter flow that
        // reran a few shared beats last cannot steal it from the comprehensive flow that proved
        // everything (which had left its screen-only reqs video-less). Only a board run records
        // video, so a CLI run's captures land under '_novideo' and the committed video rides the fold's carry.
        // THE KEY CARRIES THE TEST FILE (C2, 2026-09-06): one requirement harvested by two files in
        // one run is two entries, so a composed flow can never overwrite the home screen's harvest.
        const h = (evidenceHarvest[`spec/${rel} ${qid}`] ||= { caps: {}, testFile: `spec/${rel}`, testTitle: test.title })
        const key = (video && video.path) ? video.path : '_novideo'
        const cap = (h.caps[key] ||= { srcVideo: (video && video.path) || null, beats: {}, order: [] })
        // …and PER BEAT inside that capture. An un-keyed name (an older run) folds as beat 1.
        const n = t.beat || 1
        if (!cap.beats[n]) { cap.beats[n] = {}; cap.order.push(n) }
        const slot = cap.beats[n]
        // …AND ONE MOMENT COMES FROM ONE TEST (task 3b, 2026-09-04). A frame, its skeleton and its
        // replica are three views of ONE capture, and the gate compares two of them box for box. In
        // a run with no recording every test's captures land in this same map (there is no video
        // path to separate them) and the fill below is first-wins PER FIELD — so a requirement
        // proven by TWO tests could take its measurement from one page and its picture from another.
        // Board R20's lightbox beat did exactly that. The first test to fill a beat owns it.
        if (!claimSlot(slot, test.title)) continue
        // …AND WHOSE FILE FILED IT (final review I5, 2026-09-04). A composed flow that starts on one
        // screen may prove another's requirement (spec/init's flow tags board:R1), and evidence is
        // keyed by REQUIREMENT — so `npx playwright test spec/init` alone rewrote
        // spec/board/evidence/R1.b1.* from the init flow's page and pruned what the board's own run
        // had put there. The requirement's HOME screen owns its beats; a cross-screen flow fills
        // only what the home file left empty. Marked here, where both names are in hand, and acted
        // on at the fold (tools/evidence.mjs) and in the landing loop above.
        if (slot.foreign === undefined) slot.foreign = (screen !== qid.slice(0, qid.indexOf(':')))
        // an ASSERTED-VALUE phase (2026-08-29) — `v<k>`, the k-th value proveVisible rang and read
        // inside this beat. Kept in its own numbered map so the beat's proof can play
        // before → each value → after; first-wins per k for the same reason the pair is.
        const vk = /^v(\d+)$/.exec(String(t.phase))
        if (vk) {
          const k = Number(vk[1])
          const vslot = ((slot.values ||= {})[k] ||= {})
          // ONE HTML PER MOMENT (2026-09-04): only `replica-expected` is attached now. An `actual`
          // name can still arrive from a run of an older harness — it is not folded, and the file
          // it points at is swept by the fold's own legacy prune.
          const field = tag ? 'frame' : (lay ? 'layout' : (rep.side === 'expected' ? 'replicaExpected' : null))
          if (!field) continue
          if (!vslot[field]) vslot[field] = a.path
          h.latestKey = key
          if (testFonts.length && !fontedQids.has(qid)) { h.fonts = testFonts; fontedQids.add(qid) }
          if (testFaces.length && !h.fontFaceRules) h.fontFaceRules = testFaces
          continue
        }
        // FIRST-wins per beat, never last: a chain checked more times than it has beats clamps its
        // extra checks onto the final beat (R5's "count climbs back" is its beats' third check), and
        // letting those overwrite showed a beat's row proving a DIFFERENT check than its Then text —
        // "To do reads 4" beside frames reading 5. The storyboard beat is the first check that
        // performs it; later same-beat checks still count for coverage, their frames are extra.
        if (tag) { if (!slot[tag.phase]) slot[tag.phase] = a.path }
        else if (lay) { const f = lay.phase === 'before' ? 'layoutBefore' : 'layoutAfter'; if (!slot[f]) slot[f] = a.path }
        else {
          // ONE HTML PER MOMENT (2026-09-04): both ends of a beat land their Expected — at the
          // before moment nothing has been claimed yet, so it IS the app's unedited markup, and a
          // moment with no file is a moment with no picture. An `actual` name from an older harness
          // is not folded.
          const f = rep.side === 'expected'
            ? (rep.phase === 'before' ? 'replicaExpectedBefore' : 'replicaExpectedAfter')
            : null
          if (f && !slot[f]) slot[f] = a.path
        }
        // this BEAT's own span in the recording: the k-th `proves <id>` step of the test is the
        // k-th checkReq call, which is the k-th beat this capture saw (the step NAME is untouched —
        // coverage still derives from it). First-wins here too, same reason as the frames.
        const wins = (winCache[qid] ||= clipWindows(steps, qid))
        const k = cap.order.indexOf(n)
        if (!slot.window) slot.window = wins[k] || wins[wins.length - 1] || null
        h.latestKey = key
        if (testFonts.length && !fontedQids.has(qid)) { h.fonts = testFonts; fontedQids.add(qid) }
        if (testFaces.length && !h.fontFaceRules) h.fontFaceRules = testFaces
      }
      // Always record the case — every case now carries at least its own log, even one with no shots,
      // no video and no steps, so "each test case has its own record" holds for every case.
      shotsByTest[test.title] = {
        shots, video: video ? video.src : null, steps, log: caseLog,
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
      try { evidence = await harvestEvidence(evidenceHarvest, ranAt) } catch (err) { console.error('evidence harvest failed:', err) }
      try { await foldByScreen(byScreen, { partial, evidence }) } catch (err) { console.error('results-index fold failed:', err) }
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
          await recordRunEntry({
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
