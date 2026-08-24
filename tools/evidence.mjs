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
export function clipWindow (steps, id) {
  const want = String(id)
  const exact = (steps || []).find(s => String(s.label || '') === 'proves ' + want)
  const hit = exact || (steps || []).find(s => {
    const l = String(s.label || '')
    if (!l.startsWith('proves ')) return false
    const sid = l.slice('proves '.length)
    return (!want.includes(':') || !sid.includes(':')) && bare(sid) === bare(want)
  })
  if (!hit) return null
  if (typeof hit.t !== 'number') return null
  return { from: hit.t, to: hit.t + (typeof hit.d === 'number' ? hit.d : 0) }
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
export function evidencePaths (screen, id) {
  const dir = `spec/${screen}/evidence`
  const rid = bare(id)
  return {
    dir,
    before: `${dir}/${rid}.before.png`,
    after: `${dir}/${rid}.after.png`
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

// The attachment names checkReq emits — `evidence <id> before` / `evidence <id> after`. Anything
// else (covers, screenshots, videos) is not evidence and must never be mistaken for it.
const EVIDENCE_ATT = /^evidence (\S+) (before|after)$/
export function parseEvidenceAttachment (name) {
  const m = EVIDENCE_ATT.exec(String(name || ''))
  return m ? { id: m[1], phase: m[2] } : null
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
    const raw = (!raw0.video && old && old.video) ? { ...raw0, video: old.video } : raw0
    entry.evidence = { ...(entry.evidence || {}), [rid]: raw }
    if (old) {
      const vals = x => [x.before, x.after, x.clip, ...Object.values(x.clipVariants || {})]
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
