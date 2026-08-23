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

// The harvested frame pair, downscaled to the house 640 width at the fold (final review M4): a
// full-viewport PNG is ~140 KB and the frames are committed with the tree, so a fold of sixty
// requirements added megabytes per run. The frame stays a PNG at its deterministic path. Without
// ffmpeg the full-size frame is copied as before.
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
    after: `${dir}/${rid}.after.png`
  }
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
  for (const [qid, raw] of Object.entries(entries || {})) {
    const i = String(qid).indexOf(':')
    if (i < 1) continue                       // never invent a screen for an unqualified id
    const scr = qid.slice(0, i)
    const rid = qid.slice(i + 1)
    const entry = (index[scr] ??= {})
    const old = entry.evidence?.[rid]
    entry.evidence = { ...(entry.evidence || {}), [rid]: raw }
    if (old) {
      const vals = x => [x.before, x.after, x.clip, ...Object.values(x.clipVariants || {})]
      const kept = new Set(vals(raw).filter(Boolean))
      for (const p of vals(old)) {
        if (p && !kept.has(p)) prune.push(p)
      }
    }
  }
  return prune
}
