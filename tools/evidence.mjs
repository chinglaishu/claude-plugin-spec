// The recording already exists (a board run's .webm) and each `proves <id>` step already carries
// its offset+duration (spec/_results-reporter.mjs flattenSteps: t, d). This turns those into a
// per-requirement WINDOW — the assert body's span in the recording — and the ffmpeg args for the
// frame harvest. Pure; the caller runs ffmpeg (the frame pair alone is the evidence when it is
// absent). The Focus media pane (tools/board/client.js buildMedia) renders the harvested frames;
// its gif mode plays them as the FRAME-STEPPER (Task 13), paced by this window's true relative
// timing (tools/board/stepper.js). The looping webp clip this window once fed — and Task 11's
// 1.5×/2× variants beside it — retired with the stepper (2026-08-24): once gif mode played the
// frames themselves, nothing rendered a webp, and a cut nobody shows is disk for nothing.
const bare = id => String(id).slice(String(id).lastIndexOf(':') + 1)

// EXACT label first (final review m1 / Task 15 L1): a composed flow can carry `proves R7` AND
// `proves dispatch:R7` in one test, and the bare-id alias once handed dispatch:R7 the earlier R7
// window. The bare fallback stays only when ONE side is unqualified — two different qualified ids
// never alias.
// EVERY window, in order (2026-08-28, per-beat evidence): a requirement proven by three checks
// emits three `proves <id>` steps, one per BEAT, and each beat's frames must be paced by — and its
// video seek must land on — its OWN span. The step name is unchanged (coverage derives from it);
// this just stops collapsing the list to its first entry.
export function clipWindows (steps, id) {
  const want = String(id)
  const exact = (steps || []).filter(s => String(s.label || '') === 'proves ' + want)
  const hits = exact.length
    ? exact
    : (steps || []).filter(s => {
      const l = String(s.label || '')
      if (!l.startsWith('proves ')) return false
      const sid = l.slice('proves '.length)
      return (!want.includes(':') || !sid.includes(':')) && bare(sid) === bare(want)
    })
  return hits.filter(h => typeof h.t === 'number')
    .map(h => ({ from: h.t, to: h.t + (typeof h.d === 'number' ? h.d : 0) }))
}
export function clipWindow (steps, id) {
  return clipWindows(steps, id)[0] || null
}

// The harvested frame pair, downscaled at the fold (final review M4): a full-viewport PNG is
// ~140 KB and the frames are committed with the tree, so a fold of sixty requirements added
// megabytes per run. The frame stays a PNG at its deterministic path. Without ffmpeg the
// full-size frame is copied as before. House width 1280 since Task 16 #2 (the human, 2026-08-24,
// signed): 640 read soft once the pane showed frames large (Task 15) and near-fullscreen at the
// zoom — 1280 is a mild downscale of the 1440-wide viewport shot, crisp at both.
export function ffmpegDownscaleArgs (srcRel, outRel) {
  return ['-y', '-i', srcRel, '-vf', 'scale=1280:-2:flags=lanczos', outRel]
}

export function ffmpegFrameArgs (srcRel, atMs, outRel) {
  const secs = String(Math.round(atMs) / 1000)
  return ['-y', '-ss', secs, '-i', srcRel, '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', outRel]
}

// ---------------------------------------------------------------------------------------------
// The HARVEST (Task 15, D2 — all proof media are views over the ONE run recording; this is the raw
// material, rendering comes later). checkReq photographs the page BEFORE and AFTER each assertion
// body and attaches the pair as `evidence <id> before|after`; the reporter copies the frames to a
// deterministic per-requirement home, optionally cuts the looping clip, and FOLDS the lot into
// spec/_results-index.json. These three are the pure parts (tools/evidence-fold.test.mjs).

// Where a requirement's evidence lives: spec/<screen>/evidence/<rid>.*. Deterministic on purpose —
// re-harvesting overwrites in place, which is most of the retention rule (one set per requirement,
// the newest fold wins). Accepts a qualified id; the home is always the REQUIREMENT's screen.
// Since 2026-08-28 this pair is DERIVED, not captured: the harvest is per BEAT (below), and the
// requirement-level pair is beat 1's before with the last beat's after — the whole requirement in
// two frames, which is what every existing reader (the cover, the Focus media pane, the stepper)
// already consumes. Same paths as before, so nothing downstream moves.
export function evidencePaths (screen, id) {
  const dir = `spec/${screen}/evidence`
  const rid = bare(id)
  return {
    dir,
    before: `${dir}/${rid}.before.png`,
    after: `${dir}/${rid}.after.png`
  }
}

// PER BEAT (2026-08-28 — the board is becoming per-beat rows: Given, then one row per When→Then,
// each row showing that beat's schematic · text · proof). A requirement proven by three checks
// harvests three frame pairs and three layout pairs, keyed by the 1-based beat number the check
// proves (spec/_base.ts checkReq's BEAT_CURSOR, the same mapping the storyboard uses). The LAYOUT
// SKELETONS ride beside their frames on the same deterministic rule: the JSON the schematic is
// drawn from lives one name away from the PNG it was measured on.
export function beatEvidencePaths (screen, id, n) {
  const dir = `spec/${screen}/evidence`
  const rid = bare(id)
  const b = `${rid}.b${Number(n) || 1}`
  return {
    dir,
    before: `${dir}/${b}.before.png`,
    after: `${dir}/${b}.after.png`,
    layoutBefore: `${dir}/${b}.before.layout.json`,
    layoutAfter: `${dir}/${b}.after.layout.json`,
    // …and the REPLICA of the same moment — ONE FILE PER MOMENT (the human, 2026-09-04: "why does
    // the Expected also need a replica — the Actual is the screenshot"). The Actual half of a moment
    // IS the photograph beside it; a second HTML saying the same thing was a file to keep in step,
    // to serve, to prune and to disagree with. What lands is the EXPECTED — the app's own markup
    // with this beat's claims applied — and the gate's verdict rides on ITS root
    // (`data-replica-layout` / `data-replica-gaps`), measured in memory on the UNEDITED tree before
    // any claim was applied, in the same page pass as the skeleton. The before moment has claimed
    // nothing yet, so its Expected is that unedited tree exactly; it is still written, because a
    // moment with no file is a moment with no picture.
    replicaExpectedBefore: `${dir}/${b}.before.expected.html`,
    replicaExpectedAfter: `${dir}/${b}.after.expected.html`
  }
}

// THE ASSERTED-VALUE FRAMES INSIDE A BEAT (2026-08-29, the human: "the When must be visible in the
// proof too"). A beat's before/after pair photographs the two ENDS of an assertion body, and the
// action itself falls between them: a box carrying what was just typed into it is empty in the
// before frame and cleared again by the time of the after one, so the When was never in frame at
// all. proveVisible now photographs the page at each value it rings and reads, and each of those
// frames — with the layout skeleton the schematic's matching scene is drawn from — lands here,
// numbered by the check that took it. k is 1-based, in the order the beat proved them.
export function valueEvidencePaths (screen, id, n, k) {
  const dir = `spec/${screen}/evidence`
  const b = `${bare(id)}.b${Number(n) || 1}.v${Number(k) || 1}`
  // …and the replica of that moment — ONE FILE (2026-09-04): the Expected, the app's own markup with
  // this moment's claim applied. The Actual half is the photograph named beside it.
  return {
    dir,
    frame: `${dir}/${b}.png`,
    layout: `${dir}/${b}.layout.json`,
    replicaExpected: `${dir}/${b}.expected.html`
  }
}

// THE SCREEN'S WEB FONTS (2026-09-03). A replica is the app's own DOM, so it is only the app's own
// picture while it is set in the app's own faces — and a sandboxed iframe may reach no external URL.
// The harness fetches each @font-face file Node-side (spec/_base.ts, page.request) and the fold
// commits it here, content-named so a face shared by many requirements is one file. Refcounted per
// SCREEN like the committed video, never per requirement.
export function fontEvidencePath (screen, hash, ext) {
  return `spec/${screen}/evidence/_fonts/${hash}.${ext}`
}
// …and the ONE STYLESHEET that DECLARES them (phase 4a, 2026-09-03). The files alone are bytes: a
// replica set in the app's own type also needs the app's own `@font-face` rules, and the board
// renders it in an OPAQUE-ORIGIN srcdoc iframe that may reach no external URL at all. So the rules
// are committed beside the files they name, with every `url(...)` rewritten to the sibling file —
// one sheet per screen, exactly like the faces themselves.
export function facesCssPath (screen) {
  return `spec/${screen}/evidence/_fonts/faces.css`
}
// …AND THE SAME SHEET, SERVED (the review's C2, 2026-09-04). What is written to disk is relative to
// the `_fonts/` dir it sits in — right for the file, and right for anything that loads the file. The
// BOARD does neither: it writes the text into an `<iframe sandbox srcdoc>`, and an `about:srcdoc`
// document resolves a relative url against the PARENT's base — so every face would fetch from the
// board's own root, 404, and the replica would quietly render in a fallback stack, which is a
// picture of a different app. This points each url at the dir the sheet lives in. A url that is
// already rooted, a `data:` face and an http(s) one are left exactly as they are: absolutising an
// absolute url is how a rewrite starts inventing files.
const REL_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi
export function absoluteFacesCss (css, dir) {
  const text = String(css || '')
  const root = String(dir || '').replace(/^\/+|\/+$/g, '')
  if (!text || !root) return text
  return text.replace(REL_URL, (whole, q, url) => {
    const u = String(url).trim()
    if (!u || /^(?:https?:|data:|blob:|\/)/i.test(u)) return whole
    return 'url("/' + root + '/' + u + '")'
  })
}

// PURE: the rules the harness could read (`{cssText, urls}` — the urls already absolute, resolved in
// the page against its own baseURI) against the faces it actually FETCHED (`entry.fonts`, each with
// the content hash the file is named by). A rule rides only when EVERY url it names was fetched —
// half a face is a fallback stack wearing the app's name, and a browser that 404s one src silently
// falls back anyway, so declaring it would be a picture of a different app (rule 3). A rule naming
// no fetchable url at all (`local()`, a `data:` src) needs nothing committed and rides as it is.
// Deduped by rule text and SORTED, so a re-fold of the same harvest writes the same bytes; bounded
// at 64 KB like every other by-product, and `</style` is neutralised because this text goes into a
// `<style>` element (the same defence gateReplica's own srcdoc takes).
const FACES_CAP = 64000
export function deriveFacesCss (rules, fonts) {
  const byUrl = new Map()
  for (const f of (Array.isArray(fonts) ? fonts : [])) {
    if (f && f.url && f.hash && f.ext) byUrl.set(String(f.url), `${f.hash}.${f.ext}`)
  }
  const out = new Set()
  for (const r of (Array.isArray(rules) ? rules : [])) {
    const text = r && typeof r.cssText === 'string' ? r.cssText : ''
    if (!/^\s*@font-face/i.test(text)) continue
    const urls = Array.isArray(r.urls) ? r.urls.map(String) : []
    if (urls.some(u => !byUrl.has(u))) continue          // all of a rule's urls, or none of the rule
    let css = text
    for (const u of urls) css = css.split(u).join(byUrl.get(u))
    out.add(css.replace(/<\/style/gi, '<\\/style'))
  }
  let css = ''
  for (const line of [...out].sort()) {
    if (css.length + line.length + 1 > FACES_CAP) break
    css += (css ? '\n' : '') + line
  }
  return css
}

// Task 16 #1 (the human, 2026-08-24): the screen's COMMITTED RECORDING — the primary flow's .webm,
// persisted under the same committed evidence dir (spec/** is allowlisted and NOT gitignored; the
// transient _runs/ home stays fully ignored). Content-hash named, so a re-run with the identical
// recording overwrites nothing and a changed one lands beside the old until the fold prunes the
// orphan (foldEvidence refcounts it per screen).
export function evidenceVideoPath (screen, hash) {
  return `spec/${screen}/evidence/${hash}.webm`
}

// The committed cut: house 1280 wide (Task 16 #2's width — text stays legible), VP9 crf 38 which
// took the measured 40.7s 1440×900 VP8 source from 3.0 MB to ~0.75 MB (crf 44 saved ~200 KB more
// but softens the very text the proof exists to show), cpu-used 5 + row-mt so the encode runs
// ~0.65× realtime inside the reporter's onEnd, and -an because a Playwright recording has no audio
// track worth carrying. Without ffmpeg the caller copies the source as-is — bigger, still honest.
export function ffmpegVideoArgs (srcRel, outRel) {
  return ['-y', '-i', srcRel, '-vf', 'scale=1280:-2:flags=lanczos',
    '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-cpu-used', '5', '-row-mt', '1', '-an',
    outRel]
}

// The PRIMARY recording per screen is the one that COVERS the most requirements — a union count,
// NOT the last flow to run. The reporter keeps a run's captures PER recording, and inside each
// capture PER BEAT (2026-08-28):
//   harvest = { qid: { caps: { [key]: { srcVideo|null, order:[n…],
//                                       beats: { n: {before?, after?, layoutBefore?, layoutAfter?, window} } } },
//               latestKey } }
// where a key is a recording's video path, or '_novideo' for a capture with no recording (a CLI
// run). Counting the last capture per requirement (the old h.srcVideo, last-wins) let a shorter
// COMPOSED flow that reran a few shared beats last steal the primary from the COMPREHENSIVE flow
// that proved everything — so its screen-only requirements (e.g. the Tsumiki filters/dates beats)
// were left video-less. Counting coverage as a union fixes that: the comprehensive flow wins, and
// every requirement it covers resolves to THAT recording's frames + window + video — so the seek
// offset indexes the recording actually shown. A requirement the primary did not cover keeps its
// own latest frames and carries no video (the reader hides the button honestly). Pure — the
// reporter does the file I/O around it; unit-tested in tools/evidence.test.mjs.
export function resolvePrimaryVideo (harvest) {
  const byScreen = {}
  for (const qid of Object.keys(harvest || {})) {
    const i = qid.indexOf(':'); if (i < 1) continue
    ;(byScreen[qid.slice(0, i)] ||= []).push(qid)
  }
  const out = {}
  for (const qids of Object.values(byScreen)) {
    const cover = new Map()               // recording → how many of this screen's reqs it captured
    for (const qid of qids) {
      for (const key of Object.keys((harvest[qid] && harvest[qid].caps) || {})) {
        if (key === '_novideo') continue
        cover.set(key, (cover.get(key) || 0) + 1)
      }
    }
    let primary = null; let best = 0      // most coverage wins; ties break to the first seen (stable)
    for (const [key, n] of cover) if (n > best) { best = n; primary = key }
    for (const qid of qids) {
      const h = harvest[qid] || {}
      const caps = h.caps || {}
      const usePrimary = !!(primary && caps[primary])
      const cap = (usePrimary ? caps[primary] : caps[h.latestKey]) || {}
      // the BEATS of that one capture, in beat order. The layout skeletons ride with their own
      // frames — the schematic must be drawn from the geometry of the frames it is shown beside,
      // never from another recording's page.
      const beats = Object.keys(cap.beats || {}).map(Number).sort((a, b) => a - b).map(n => {
        const s = cap.beats[n] || {}
        return {
          n,
          before: s.before || null,
          after: s.after || null,
          layoutBefore: s.layoutBefore || null,
          layoutAfter: s.layoutAfter || null,
          // …and the ONE REPLICA of each end of the beat (2026-09-04), resolved from the SAME capture
          // as the photograph it is shown against — for the same reason the skeleton is.
          replicaExpectedBefore: s.replicaExpectedBefore || null,
          replicaExpectedAfter: s.replicaExpectedAfter || null,
          window: s.window || null,
          // the beat's asserted values in CHECK order (2026-08-29) — sorted by the check number the
          // attachment carried, never by the order the attachments happened to arrive in
          values: Object.keys(s.values || {}).map(Number).sort((a, b) => a - b).map(k => ({
            k,
            frame: (s.values[k] || {}).frame || null,
            layout: (s.values[k] || {}).layout || null,
            replicaExpected: (s.values[k] || {}).replicaExpected || null
          }))
        }
      })
      // the REQUIREMENT-level pair is derived, never captured: the first beat's before, the last
      // beat's after, and the span that covers every beat between them (what the frame-stepper
      // paces the two-frame pair by, and what a video seek opens on).
      const wins = beats.map(b => b.window).filter(Boolean)
      const firstFrame = beats.find(b => b.before)
      const lastFrame = [...beats].reverse().find(b => b.after)
      out[qid] = {
        before: (firstFrame && firstFrame.before) || null,
        after: (lastFrame && lastFrame.after) || null,
        window: wins.length
          ? { from: Math.min(...wins.map(w => w.from)), to: Math.max(...wins.map(w => w.to)) }
          : null,
        beats,
        // the WEB FONTS the run fetched for this requirement's page (2026-09-03) — a plain
        // pass-through, so the reporter can commit each face once per screen and point the entry at
        // it. Always an array: a run that fetched none says so rather than leaving the key undefined.
        fonts: Array.isArray(h.fonts) ? h.fonts : [],
        // …and the RULES that declare them (phase 4a), the same plain pass-through: the reporter
        // turns them into the screen's one servable faces.css beside the files above.
        fontFaceRules: Array.isArray(h.fontFaceRules) ? h.fontFaceRules : [],
        srcVideo: usePrimary ? primary : null
      }
    }
  }
  return out
}

// The attachment names checkReq emits — `evidence <id> before` / `evidence <id> after`. Anything
// else (covers, screenshots, videos) is not evidence and must never be mistaken for it.
// Since 2026-08-28 the name carries the BEAT: `evidence <id>#<n> before`. The un-keyed form is
// still read (a record from an older run, a mixed tree) and folded as beat 1, so nothing that was
// harvested before this change reads as unharvested.
// …and since 2026-08-29 a third phase shape, `v<k>`: the k-th asserted value proven inside that
// beat (proveVisible's own frame). Numbered, always — a bare `v` is not a phase.
const EVIDENCE_ATT = /^evidence ([^#\s]+)(?:#(\d+))? (before|after|v\d+)$/
export function parseEvidenceAttachment (name) {
  const m = EVIDENCE_ATT.exec(String(name || ''))
  return m ? { id: m[1], beat: m[2] ? Number(m[2]) : null, phase: m[3] } : null
}

// The LAYOUT attachment names snapLayout emits — `layout <id>#<n> before|after`, mirroring the
// frame pair exactly (2026-08-28, the UI-mirror schematic). Same strictness: any other name is not
// a layout and must never be folded as one.
const LAYOUT_ATT = /^layout ([^#\s]+)(?:#(\d+))? (before|after|v\d+)$/
export function parseLayoutAttachment (name) {
  const m = LAYOUT_ATT.exec(String(name || ''))
  return m ? { id: m[1], beat: m[2] ? Number(m[2]) : null, phase: m[3] } : null
}

// The ACTUAL REPLICA attachment names snapReplica emits — `replica <id>#<n> before|after|v<k>`,
// mirroring the frame and its skeleton exactly (2026-09-03). Same strictness for the same reason:
// a name that is not one of these is not a replica and must never be folded as one.
// …and since phase 2 (2026-09-03) a moment files TWO of them: `replica …` is the ACTUAL (the app's
// own picture) and `replica-expected …` the EXPECTED (the same markup with the beat's claims
// applied). One parser for both, because they must always be folded onto the same moment — a row
// showing an Expected from one capture beside an Actual from another is a comparison of nothing.
const REPLICA_ATT = /^replica(-expected)? ([^#\s]+)(?:#(\d+))? (before|after|v\d+)$/
export function parseReplicaAttachment (name) {
  const m = REPLICA_ATT.exec(String(name || ''))
  return m ? { id: m[2], beat: m[3] ? Number(m[3]) : null, phase: m[4], side: m[1] ? 'expected' : 'actual' } : null
}

// …and the FONT files fetched beside them — `font <hash> <family>`. The hash is the content hash the
// harness named the file by (hex), the family the name the page's @font-face declared; a family may
// carry spaces, a hash may not. Anything else is not a font attachment.
// …and since phase 4a (2026-09-03) the SOURCE URL rides between them, optionally: `font <hash>
// <url> <family>`. deriveFacesCss rewrites each `url(...)` of a committed @font-face rule to the
// file beside it, and only the url can say which file a rule's src became — one family is several
// files (a weight, an italic), so the family cannot answer it. Optional on purpose: a record from
// before this carries no url and must still read as a fetched face, not as a missing one. Only
// http(s) is lifted, which is also the only thing the harness ever fetches.
const FONT_ATT = /^font ([0-9a-f]{8,64}) (?:(https?:\/\/\S+) )?(\S.*)$/
export function parseFontAttachment (name) {
  const m = FONT_ATT.exec(String(name || ''))
  if (!m) return null
  return { hash: m[1], ...(m[2] ? { url: m[2] } : {}), family: m[3].trim() }
}

// …and the READABLE @font-face RULES of a moment — `fontfaces <id>#<n> <phase>` (phase 4a). The
// file the harness attaches under this name is JSON: `{cssText, urls}[]`, the urls already absolute.
// Named per moment because that is where the capture reads them, folded per SCREEN because that is
// what the board serves: one `_fonts/faces.css` beside the faces it declares.
const FACES_ATT = /^fontfaces ([^#\s]+)(?:#(\d+))? (before|after|v\d+)$/
export function parseFontFacesAttachment (name) {
  const m = FACES_ATT.exec(String(name || ''))
  return m ? { id: m[1], beat: m[2] ? Number(m[2]) : null, phase: m[3] } : null
}

// THE MOMENT'S NAME AND ITS OFFSET (the human, 2026-09-02: "schematic and proof should share same
// stepper (as their steps must be same???)"). A beat is ONE ordered list of MOMENTS — every value
// the test proved, in the order it proved them, then the beat's result — and the row's single
// stepper names each of them by the assertion the run actually made. Both facts ride the value
// frame's own layout skeleton (spec/_base.ts snapValue passes the current CLAIM's label into
// snapLayout beside the `at` offset that already rode there), so this is a pure lift, never a
// guess: a skeleton that carries neither yields neither, and the board falls back to a generic
// name and equal holds rather than inventing either one.
//
// The label is bounded and collapsed HERE too, not only at capture: what is on disk was written by
// a run and is read back into an HTML attribute, so the reader's own gate cannot depend on the
// writer having been careful.
export const MOMENT_LABEL_MAX = 140
// …and THE CLAIM the moment made (the human, 2026-09-02, on Tsumiki's deliberately failing R9: "for
// the failed test case, schematic should be correct (schematic and behaviour are truth — otherwise
// user should disagree this truth and update it). But now even the schematic is wrong as well").
// What the assertion ASKED FOR travels beside what the page gave it, so the drawn mirror can show
// the INTENT on a scene the app failed while the photograph beside it keeps the measurement and its
// red verdict. Whole or not at all: two strings and a boolean. A half-claim is no claim — an
// expected with no verdict would have the drawing guessing whether it held, and a guess about a
// failure is exactly the fake green this board exists to refuse.
const oneLine = s => String(s).replace(/\s+/g, ' ').trim().slice(0, MOMENT_LABEL_MAX)
function claimOf (c) {
  if (!c || typeof c !== 'object') return null
  if (typeof c.expected !== 'string' || typeof c.got !== 'string' || typeof c.ok !== 'boolean') return null
  const expected = oneLine(c.expected); const got = oneLine(c.got)
  if (!expected && !got) return null
  // `missing` (2026-09-02): the check found nothing to read — carried through so the drawn mirror
  // can tell a removed element from a wrong value (tools/viz.mjs intendedLayout)
  return { expected, got, ok: c.ok, ...(c.missing === true ? { missing: true } : {}) }
}
export function valueMeta (layout) {
  const out = {}
  const at = layout ? Number(layout.at) : NaN
  if (Number.isFinite(at)) out.at = at
  if (layout && typeof layout.label === 'string') {
    const label = oneLine(layout.label)
    if (label) out.label = label
  }
  const claim = claimOf(layout && layout.claim)
  if (claim) out.claim = claim
  // …and WHETHER THE PHOTOGRAPH LANDED (task 3b, item 5, 2026-09-04). `snapEvidence` bounds its
  // screenshot so a slow page costs the bound and never the run; on a loaded machine that bound was
  // reached, the frame was never attached, and the fold — which kept a moment only if its photograph
  // landed — dropped the moment whole and pruned its replica with it. Four board beats then went red
  // on a missing specimen with nothing anywhere saying why. The bound stays; the SILENCE goes. Only
  // the flag itself travels, never a truthy anything.
  if (layout && layout.dropped === true) out.dropped = true
  return out
}

/**
 * valueLanded(got) → did this moment happen at all?
 *
 * A moment is what the run MEASURED, not what it managed to photograph: a skeleton with no frame is
 * a moment whose picture was dropped (and which says so, above), and the board's reader already
 * skips a frameless one. Keeping it is what makes the drop visible in the index instead of silently
 * shortening the beat — and what keeps its replica from being pruned as superseded.
 */
/**
 * claimSlot(slot, owner) → may this owner fill this beat slot?
 *
 * A beat's frame, its skeleton and its replica are three views of ONE capture, and the gate compares
 * two of them box for box — so they must come from one test's page. In a run with no recording every
 * test's captures land in the same per-capture map (there is no video path to separate them), and
 * the fill is first-wins PER FIELD: a requirement proven by two tests could take its skeleton from
 * one and its replica from the other. Board R20's lightbox beat did exactly that — a measurement
 * with the lightbox open against a picture of the page without it, which no capture fix could close.
 * The first test to fill a slot owns it; the rest of its fields still land, another test's do not.
 */
export function claimSlot (slot, owner) {
  if (!slot || owner == null) return true
  if (slot.by === undefined) { slot.by = owner; return true }
  return slot.by === owner
}

export function valueLanded (got) {
  return !!(got && (got.frame || got.layout))
}

// THE FOCUS RECT (2026-08-28): where the ring was when the beat's AFTER frame was taken, in page
// coordinates, with the viewport it was measured in — so the board can ZOOM the proof media onto
// the component being proven instead of showing a full-page frame and asking a reader to hunt.
// It rides inside the layout skeleton (snapLayout already records the ring and the viewport), so
// there is one source of truth and no extra attachment; this lifts it into the index shape.
// Null when that beat painted no ring, and the key is then simply absent.
export function focusFromLayout (layout) {
  const r = layout && layout.ring
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)
  if (!r || num(r.x) == null || num(r.y) == null || !(num(r.w) > 0) || !(num(r.h) > 0)) return null
  const vw = num(layout.w); const vh = num(layout.h)
  if (!(vw > 0) || !(vh > 0)) return null
  return { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h), vw, vh }
}

// THE BEAT'S CAMERA, over ALL of its phases (2026-08-29). A beat rings more than one thing now —
// the value its When typed, then the value its Then produced — and a camera aimed at the last ring
// alone would crop the earlier ones out of the row on BOTH sides, which is exactly the "the When is
// not visible" complaint. The union of the beat's rings is still ONE rect (board R19: one camera,
// both cells, same region), and it is honestly the region this beat's assertions pointed at. A beat
// with a single ring unions to that ring, byte for byte what focusFromLayout returned before.
export function focusFromLayouts (layouts) {
  let out = null
  for (const l of (layouts || [])) {
    const f = focusFromLayout(l)
    if (!f) continue
    if (!out) { out = f; continue }
    if (f.vw !== out.vw || f.vh !== out.vh) continue    // a different viewport is a different page
    const x = Math.min(out.x, f.x); const y = Math.min(out.y, f.y)
    const r = Math.max(out.x + out.w, f.x + f.w); const b = Math.max(out.y + out.h, f.y + f.h)
    out = { x, y, w: r - x, h: b - y, vw: out.vw, vh: out.vh }
  }
  return out
}

// THE HOLE IN THE SHELL (phase 7, 2026-09-04) — where a borrowed page has room for a picture.
// A screen with no test has no harvest and therefore no replica: its Expected cell is the archetype
// SKETCH. On bare paper that sketch reads as a diagram out of some other product; inside a SIBLING
// screen's captured page it reads as this product's screen, not built yet. So the sketch is placed
// in the CONTENT area of the borrowed page — the viewport minus the shell bands the harvest
// measured: a painted box that hugs one edge and spans (almost) the whole of the perpendicular side
// is the app's header, footer or rail, and what is left between them is where a screen's own words
// go. Measured, never guessed — the same `bg` signal the plates use, on the same skeleton — and it
// refuses to shrink the page to a sliver: a shell it cannot read as a frame leaves the whole page,
// which is honest rather than a picture in a slot that is not there. Pure; unit-tested in
// tools/chrome-from.test.mjs.
const SHELL_SPAN = 0.9      // a band spans (almost) the whole perpendicular side …
const SHELL_MAX = 0.5       // … and is never more than half the page: that is a page, not a band
const SHELL_MIN = 0.25      // what must be LEFT for the hole to be a hole at all
const SHELL_EDGE = 0.02     // …and it HUGS the edge it spans from, end to end
// `docH` is the LENDER'S OWN DOCUMENT HEIGHT — its replica's `data-replica-region` height, not the
// viewport's (fix round 1, the review's I1). Every Before replica is a scrolling document (the
// board's own is 1904 px tall in a 900 px viewport), so "a wide box whose bottom reaches vh" is not
// a footer at all: it is whatever content happens to cross the FOLD. On this repo's one real lender
// that is the home page's last area card (1318×273 at y=814), and the hole came back 86 px short
// with the lender's own content showing under a caption saying the row is a sketch. A footer is now
// a band that reaches the DOCUMENT's bottom — which, on a long page, is far below anything the cell
// shows, so it correctly takes nothing off the visible hole. Absent, the viewport is the document,
// which is the old answer and the right one for a page that does not scroll.
export function contentRect (layout, docH) {
  const vw = Number(layout && layout.w) || 0
  const vh = Number(layout && layout.h) || 0
  if (!(vw > 0) || !(vh > 0)) return null
  const pageH = Number(docH) > 0 ? Number(docH) : vh
  const ex = Math.max(1, vw * SHELL_EDGE)
  const ey = Math.max(1, vh * SHELL_EDGE)
  const els = (layout && Array.isArray(layout.els)) ? layout.els : []
  const whole = { x: 0, y: 0, w: vw, h: vh }
  let l = 0; let t = 0; let r = vw; let b = vh
  for (const e of els) {
    if (!e || !e.bg) continue
    const x = Number(e.x); const y = Number(e.y); const w = Number(e.w); const h = Number(e.h)
    if (!(w > 0) || !(h > 0) || !Number.isFinite(x) || !Number.isFinite(y)) continue
    // A BAND HUGS THE AXIS IT SPANS (the review's I1, second half): being wide is not enough — a
    // centred card 1318 px across a 1440 px page is content, and reading it as a header or a footer
    // is how a measured placement stops being measured. It must start at one edge and reach the other.
    const band = w >= vw * SHELL_SPAN && x <= ex && x + w >= vw - ex && h <= vh * SHELL_MAX
    const rail = h >= vh * SHELL_SPAN && w <= vw * SHELL_MAX
    if (band && y <= ey) t = Math.max(t, y + h)                 // the header — the top of the page IS an edge
    if (band && y + h >= pageH - ey) b = Math.min(b, y)         // the footer — the DOCUMENT's bottom, never the fold
    if (rail && x <= ex) l = Math.max(l, x + w)                 // the left rail
    if (rail && x + w >= vw - ex) r = Math.min(r, x)            // the right rail
  }
  if (!(r - l >= vw * SHELL_MIN) || !(b - t >= vh * SHELL_MIN)) return whole
  return { x: l, y: t, w: r - l, h: b - t }
}

// Fold one run's harvest into the results index — the same rules coverage follows: merged per
// requirement onto the REQUIREMENT's screen (a qualified `x:R3` lands on screen x, wherever the
// tagging test's file lives), and a requirement or screen the run did not touch keeps its evidence
// untouched. Mutates `index` (it is called inside spec-store's single read-modify-write of the
// file) and returns the superseded file paths no longer referenced — the caller deletes those so
// disk stays bounded (deterministic paths overwrite in place; only a path the new entry dropped
// needs pruning). Task 13 note: a LEGACY entry may still name the retired webp clip and Task 11's
// variants — the prune below reads the OLD entry's fields, so those files are named for deletion
// on the requirement's next fold; nothing carries them forward (D1's carryClip retired with the
// clip it existed to keep — a carried file nothing renders would live forever).
// THE FILES THE OLD SHAPE LEFT BEHIND (2026-09-04, one html per moment). Until this release every
// moment landed TWO html files — `<id>.b<n>.<phase>.actual.html` beside `.expected.html` — and the
// Actual half is now the photograph, so nothing names those paths any more. `foldEvidence`'s
// keep-set can only prune a path some entry USED to name; a file no index entry ever mentions again
// would sit in the tree for ever, be served, and be gated by `npm run proof mirror` as an ungated
// replica. Pure so it can be tested: hand it the names in a screen's evidence directory, get back
// the ones that are the retired half. (`.expected.html` is never in the answer, whatever else is.)
export function legacyActualReplicas (files) {
  return (Array.isArray(files) ? files : []).filter(n => /\.actual\.html$/.test(String(n || '')))
}

export function foldEvidence (index, entries) {
  const prune = []
  // Task 16 #1: the committed video is SHARED per screen (one primary recording, many
  // requirements), so its lifecycle differs from the per-entry frames on purpose — carried across
  // a video-less fold, replaced by a fresh one, and the FILE pruned only when no entry of its
  // screen references it any more (refcounted below, not per-entry like the frames).
  const touched = new Set()
  const beforeShared = new Map()
  const sharedRefs = scr => {
    const s = new Set()
    for (const e of Object.values(index[scr]?.evidence || {})) {
      if (e && e.video && e.video.path) s.add(e.video.path)
      // the screen's WEB FONTS are refcounted on the same rule (2026-09-03): shared by every
      // requirement of the screen, so a face is orphaned only once no entry names it any more
      for (const f of (Array.isArray(e?.fonts) ? e.fonts : [])) if (f && f.path) s.add(f.path)
      // …and the SHEET that declares them (phase 4a): one per screen, shared by every entry, so it
      // is orphaned on the same rule — the last entry to drop it is the one that frees the file
      if (e && e.fontFaces) s.add(e.fontFaces)
    }
    return s
  }
  for (const [qid, raw0] of Object.entries(entries || {})) {
    const i = String(qid).indexOf(':')
    if (i < 1) continue                       // never invent a screen for an unqualified id
    const scr = qid.slice(0, i)
    const rid = qid.slice(i + 1)
    const entry = (index[scr] ??= {})
    if (!beforeShared.has(scr)) beforeShared.set(scr, sharedRefs(scr))
    touched.add(scr)
    const old = entry.evidence?.[rid]
    // The CARRY (D1, resurrected 2026-08-24 for an artifact that has a renderer again — the
    // reader's video mode plays the committed .webm): a video-less fold (a CLI run) keeps the
    // committed video, its seek offsets frozen WITH it — the new fold's window indexes a recording
    // that was never committed, so it must never re-aim the old one. A fold that brings a fresh
    // video replaces the whole object.
    let raw = (!raw0.video && old && old.video) ? { ...raw0, video: old.video } : raw0
    // The LAYOUT carry (2026-08-28), per beat and on the video's rule rather than the frames': a
    // layout is the SOURCE the committed schematic was drawn from, so a run whose capture failed
    // (a page torn down mid-assert) must not delete the drawing's source and silently drop the
    // requirement back to an archetype. A beat that brings fresh layouts replaces its own.
    // …and the REPLICA carry beside it, on exactly the same rule (2026-09-03): the replica is the
    // source the Expected view is BUILT from, so a run whose capture failed must not delete it and
    // leave the row with a photograph and no picture beside it. A beat that brings fresh replicas
    // replaces its own.
    const oldBeat = n => (old && old.beats ? old.beats.find(b => b && b.n === n) : null)
    if (Array.isArray(raw.beats) && old && Array.isArray(old.beats)) {
      const beats = raw.beats.map(b => {
        const o = oldBeat(b.n)
        if (!o) return b
        // THE HOME SCREEN'S FILE OWNS ITS BEATS (final review I5, 2026-09-04). Evidence is keyed by
        // REQUIREMENT, so a composed flow that starts on one screen and proves another's requirement
        // (spec/init's flow tags board:R1) writes into the other screen's evidence — and running
        // that flow ALONE rewrote spec/board/evidence/R1.b1.* from the init page and pruned what the
        // board's own run had put there, turning the next board run red. A cross-screen flow fills
        // only beats the home file left empty: where the home screen already harvested this beat,
        // its files stand and nothing here names them for pruning. (The reporter marks the beat and
        // does not even copy the bytes; this is the index half of the same rule, and the half a unit
        // test can hold.) Coverage is untouched — the flow still PROVES the requirement.
        if (b.foreign) return o
        let carried = b
        if (!(b.layoutBefore || b.layoutAfter) && (o.layoutBefore || o.layoutAfter)) {
          carried = { ...carried }
          if (o.layoutBefore) carried.layoutBefore = o.layoutBefore
          if (o.layoutAfter) carried.layoutAfter = o.layoutAfter
          if (!carried.focus && o.focus) carried.focus = o.focus   // the zoom rides with its layout
        }
        // the Expected rides in the SAME test as the Actual (phase 2): the two are one picture of
        // one moment, so a fold that carries one and refreshes the other would put a stale intent
        // beside a fresh photograph — exactly the drift the mirror guard exists to refuse.
        // …AND ONLY WHERE SOMETHING WAS MEASURED (task 3b, item 4, 2026-09-04). A replica is the
        // picture the gate checks AGAINST the skeleton of the same moment; with no skeleton it can
        // never be checked, and `npm run proof mirror` says so forever ("not gated … no layout
        // skeleton beside it"). spec/dispatch R4/R5/R6 are API-only beats — they run against a blank
        // page, the walk measures nothing, and since phase 3's C3a no replica is written for them at
        // all — yet twelve files from before that rule survived every re-harvest, because this carry
        // asked only whether the NEW beat brought a replica. So the two travel together or not at
        // all: the before replica rides with the before skeleton, the after pair with the after one,
        // and an orphan is dropped and its file pruned like any other path the new entry stopped
        // naming. (The carry itself stays: a run whose capture failed must not delete the source the
        // Expected view is built from.)
        const hasB = !!(carried.layoutBefore || b.layoutBefore)
        const hasA = !!(carried.layoutAfter || b.layoutAfter)
        if (!(b.replicaExpectedBefore || b.replicaExpectedAfter) &&
            ((o.replicaExpectedBefore && hasB) || (o.replicaExpectedAfter && hasA))) {
          carried = carried === b ? { ...carried } : carried
          if (o.replicaExpectedBefore && hasB) carried.replicaExpectedBefore = o.replicaExpectedBefore
          if (o.replicaExpectedAfter && hasA) carried.replicaExpectedAfter = o.replicaExpectedAfter
        }
        return carried
      })
      if (beats.some((b, j) => b !== raw.beats[j])) raw = { ...raw, beats }
    }
    // THE SCREEN'S FONTS, carried like the video and refcounted like it below: a fold that fetched
    // none (an unchanged page, a worker that already had them) keeps the faces the entry names, so
    // the committed files stay referenced and the replica stays set in the app's own type.
    if (!Array.isArray(raw.fonts) && old && Array.isArray(old.fonts)) raw = { ...raw, fonts: old.fonts }
    // …and the sheet beside them (phase 4a): a fold that read no rule (a page with no web font, a
    // capture that failed) keeps the committed one rather than leaving the replica in a fallback stack
    if (!raw.fontFaces && old && old.fontFaces) raw = { ...raw, fontFaces: old.fontFaces }
    entry.evidence = { ...(entry.evidence || {}), [rid]: raw }
    if (old) {
      // every file an entry names — the requirement-level pair, every beat's four, and a legacy
      // entry's retired clip set — so a path the new entry dropped is named for deletion
      const vals = x => [x.before, x.after, x.clip, ...Object.values(x.clipVariants || {}),
        ...(Array.isArray(x.beats) ? x.beats : []).flatMap(b =>
          b
            ? [b.before, b.after, b.layoutBefore, b.layoutAfter,
                // …and the beat's TWO REPLICAS (2026-09-04, one per moment), on the frames' rule: a
                // dropped beat leaves neither a picture nor the html beside it behind
                b.replicaExpectedBefore, b.replicaExpectedAfter,
                // …and every asserted-value frame the beat carried, with its skeleton and its own
                // replica: a beat that lost a check must not leave its frames behind (2026-08-29)
                ...(Array.isArray(b.values) ? b.values : []).flatMap(v => (v ? [v.frame, v.layout, v.replicaExpected] : []))]
            : [])]
      const kept = new Set(vals(raw).filter(Boolean))
      for (const p of vals(old)) {
        if (p && !kept.has(p)) prune.push(p)
      }
    }
  }
  for (const scr of touched) {
    const after = sharedRefs(scr)
    for (const p of beforeShared.get(scr) || []) if (!after.has(p)) prune.push(p)
  }
  return prune
}
