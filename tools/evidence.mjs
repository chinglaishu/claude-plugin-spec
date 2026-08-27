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
    layoutAfter: `${dir}/${b}.after.layout.json`
  }
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
          window: s.window || null
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
const EVIDENCE_ATT = /^evidence ([^#\s]+)(?:#(\d+))? (before|after)$/
export function parseEvidenceAttachment (name) {
  const m = EVIDENCE_ATT.exec(String(name || ''))
  return m ? { id: m[1], beat: m[2] ? Number(m[2]) : null, phase: m[3] } : null
}

// The LAYOUT attachment names snapLayout emits — `layout <id>#<n> before|after`, mirroring the
// frame pair exactly (2026-08-28, the UI-mirror schematic). Same strictness: any other name is not
// a layout and must never be folded as one.
const LAYOUT_ATT = /^layout ([^#\s]+)(?:#(\d+))? (before|after)$/
export function parseLayoutAttachment (name) {
  const m = LAYOUT_ATT.exec(String(name || ''))
  return m ? { id: m[1], beat: m[2] ? Number(m[2]) : null, phase: m[3] } : null
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
export function foldEvidence (index, entries) {
  const prune = []
  // Task 16 #1: the committed video is SHARED per screen (one primary recording, many
  // requirements), so its lifecycle differs from the per-entry frames on purpose — carried across
  // a video-less fold, replaced by a fresh one, and the FILE pruned only when no entry of its
  // screen references it any more (refcounted below, not per-entry like the frames).
  const touched = new Set()
  const beforeVids = new Map()
  const vidRefs = scr => {
    const s = new Set()
    for (const e of Object.values(index[scr]?.evidence || {})) {
      if (e && e.video && e.video.path) s.add(e.video.path)
    }
    return s
  }
  for (const [qid, raw0] of Object.entries(entries || {})) {
    const i = String(qid).indexOf(':')
    if (i < 1) continue                       // never invent a screen for an unqualified id
    const scr = qid.slice(0, i)
    const rid = qid.slice(i + 1)
    const entry = (index[scr] ??= {})
    if (!beforeVids.has(scr)) beforeVids.set(scr, vidRefs(scr))
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
    const oldBeat = n => (old && old.beats ? old.beats.find(b => b && b.n === n) : null)
    if (Array.isArray(raw.beats) && old && Array.isArray(old.beats)) {
      const beats = raw.beats.map(b => {
        if (b.layoutBefore || b.layoutAfter) return b
        const o = oldBeat(b.n)
        if (!o || !(o.layoutBefore || o.layoutAfter)) return b
        const carried = { ...b }
        if (o.layoutBefore) carried.layoutBefore = o.layoutBefore
        if (o.layoutAfter) carried.layoutAfter = o.layoutAfter
        if (!carried.focus && o.focus) carried.focus = o.focus   // the zoom rides with its layout
        return carried
      })
      if (beats.some((b, j) => b !== raw.beats[j])) raw = { ...raw, beats }
    }
    entry.evidence = { ...(entry.evidence || {}), [rid]: raw }
    if (old) {
      // every file an entry names — the requirement-level pair, every beat's four, and a legacy
      // entry's retired clip set — so a path the new entry dropped is named for deletion
      const vals = x => [x.before, x.after, x.clip, ...Object.values(x.clipVariants || {}),
        ...(Array.isArray(x.beats) ? x.beats : []).flatMap(b =>
          b ? [b.before, b.after, b.layoutBefore, b.layoutAfter] : [])]
      const kept = new Set(vals(raw).filter(Boolean))
      for (const p of vals(old)) {
        if (p && !kept.has(p)) prune.push(p)
      }
    }
  }
  for (const scr of touched) {
    const after = vidRefs(scr)
    for (const p of beforeVids.get(scr) || []) if (!after.has(p)) prune.push(p)
  }
  return prune
}
