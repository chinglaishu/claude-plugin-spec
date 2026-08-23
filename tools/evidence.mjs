// The recording already exists (a board run's .webm) and each `proves <id>` step already carries
// its offset+duration (spec/_results-reporter.mjs flattenSteps: t, d). This turns those into a
// per-requirement clip window and the ffmpeg args to cut a short looping webp — the requirement's
// gif face (visual-requirements redesign). Pure; the caller runs ffmpeg (the frame pair alone is
// the evidence when it is absent). The Focus media pane (tools/board/client.js buildMedia) renders
// the harvested frames and, where a board run cut one, the clip.
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

// Task 11 (play speed): an animated webp cannot be rate-controlled in the browser and the run's
// video is pruned later, so the 1.5x/2x VARIANTS are cut AT HARVEST beside the 1x — same source
// window (-ss/-t untouched: speed changes pacing, never the cut), setpts compresses time, and the
// fps scales WITH the speed (12·s → 18/24) so every variant keeps the 1x sampling density: each
// output frame still spans 1/12s of SOURCE time — same frame count, ~same size, motion exactly as
// smooth as the 1x. (A flat fps=12 at 2x would halve the sampling and read choppier; a flat 24
// at 1x would double every file for nothing.)
export const CLIP_SPEEDS = { '1.5x': 1.5, '2x': 2 }
export function ffmpegClipArgs (srcRel, { from, to }, outRel, speed = 1) {
  const secs = n => String(Math.round(n) / 1000)
  const dur = Math.max(0.4, (to - from) / 1000)
  const vf = speed === 1
    ? 'scale=640:-2:flags=lanczos,fps=12'
    : `setpts=PTS/${speed},scale=640:-2:flags=lanczos,fps=${Math.round(12 * speed)}`
  return [
    '-y', '-ss', secs(from), '-t', String(dur), '-i', srcRel,
    '-an', '-vf', vf, '-loop', '0', outRel
  ]
}

// The harvested frame pair, downscaled to the clip's width at the fold (final review M4): a
// full-viewport PNG is ~140 KB and the frames are committed with the tree, so a fold of sixty
// requirements added megabytes per run. Same scale filter as the clip; the frame stays a PNG at
// its deterministic path. Without ffmpeg the 1× frame is copied as before.
export function ffmpegDownscaleArgs (srcRel, outRel) {
  return ['-y', '-i', srcRel, '-vf', 'scale=640:-2:flags=lanczos', outRel]
}

export function ffmpegFrameArgs (srcRel, atMs, outRel) {
  const secs = String(Math.round(atMs) / 1000)
  return ['-y', '-ss', secs, '-i', srcRel, '-frames:v', '1', '-vf', 'scale=640:-2:flags=lanczos', outRel]
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
    after: `${dir}/${rid}.after.png`,
    clip: `${dir}/${rid}.clip.webp`,
    // the speed variants (Task 11), keyed by the label the board's speed button shows — the 1x
    // keeps the bare name so every pre-variant consumer keeps working untouched
    clipVariants: { '1.5x': `${dir}/${rid}.clip.15x.webp`, '2x': `${dir}/${rid}.clip.2x.webp` }
  }
}

// The attachment names checkReq emits — `evidence <id> before` / `evidence <id> after`. Anything
// else (covers, screenshots, videos) is not evidence and must never be mistaken for it.
const EVIDENCE_ATT = /^evidence (\S+) (before|after)$/
export function parseEvidenceAttachment (name) {
  const m = EVIDENCE_ATT.exec(String(name || ''))
  return m ? { id: m[1], phase: m[2] } : null
}

// D1 (the human, 2026-08-22 — final review M3): does a video-less fold keep the previous clip?
// Only a BOARD run records video, so every CLI `npm run e2e` used to fold `clip: null` and prune
// the gif the last watched run cut. The clip stays while (a) this fold cut none, (b) the
// requirement is still proven after this fold (no gif under a red chip — rule 3), and (c) the
// requirement's TEXT HASH is the one the clip was cut for — `hash` is reqHash(meaningText), the
// same pin Changed-drift uses. The pin is deliberately NOT the frame bytes: the pair is
// re-photographed every fold and differs byte for byte each time (clocks, counts), so a
// content-hash rule would keep nothing, ever. A fold WITH a video always replaces. An old entry
// with no pin (pre-D1) cannot vouch for its clip and drops it.
export function carryClip (old, e, proven) {
  return !!(old && old.clip && !e.clip && proven && e.hash && old.hash === e.hash)
}

// Fold one run's harvest into the results index — the same rules coverage follows: merged per
// requirement onto the REQUIREMENT's screen (a qualified `x:R3` lands on screen x, wherever the
// tagging test's file lives), and a requirement or screen the run did not touch keeps its evidence
// untouched. Mutates `index` (it is called inside spec-store's single read-modify-write of the
// file) and returns the superseded file paths no longer referenced — the caller deletes those so
// disk stays bounded (deterministic paths overwrite in place; only a path the new entry dropped,
// e.g. a stale clip when this fold cut none, needs pruning). `proven(qid)` is the caller's oracle
// for carryClip — the board-wide folded status after THIS fold; absent, nothing is carried (the
// strict pre-D1 prune). A clip names the run that cut it (clipRunId/clipAt) so a carried one is
// never mistaken for this fold's.
export function foldEvidence (index, entries, { proven = () => false } = {}) {
  const prune = []
  for (const [qid, raw] of Object.entries(entries || {})) {
    const i = String(qid).indexOf(':')
    if (i < 1) continue                       // never invent a screen for an unqualified id
    const scr = qid.slice(0, i)
    const rid = qid.slice(i + 1)
    const entry = (index[scr] ??= {})
    const old = entry.evidence?.[rid]
    let e = raw
    // the speed variants (Task 11) ride the 1x clip's OWN D1 decision as one set — a carry keeps
    // them with it, a drop drops them all, a fresh cut brings its own (or none — never invented)
    if (carryClip(old, raw, proven(qid))) {
      e = {
        ...raw,
        clip: old.clip,
        ...(old.clipVariants ? { clipVariants: old.clipVariants } : {}),
        clipRunId: old.clipRunId || old.runId,
        clipAt: old.clipAt || old.at
      }
    } else if (raw.clip) {
      e = { ...raw, clipRunId: raw.runId, clipAt: raw.at }
    }
    entry.evidence = { ...(entry.evidence || {}), [rid]: e }
    if (old) {
      const vals = x => [x.before, x.after, x.clip, ...Object.values(x.clipVariants || {})]
      const kept = new Set(vals(e).filter(Boolean))
      for (const p of vals(old)) {
        if (p && !kept.has(p)) prune.push(p)
      }
    }
  }
  return prune
}
