// The recording already exists (a board run's .webm) and each `proves <id>` step already carries
// its offset+duration (spec/_results-reporter.mjs flattenSteps: t, d). This turns those into a
// per-requirement clip window and the ffmpeg args to cut a short looping webp — the requirement's
// gif face (visual-requirements redesign). Pure; the caller runs ffmpeg (frame-pair fallback when
// it is absent is a separate integration task). Nothing renders this yet.
const bare = id => String(id).slice(String(id).lastIndexOf(':') + 1)

export function clipWindow (steps, id) {
  const want = bare(id)
  for (const s of steps || []) {
    if (String(s.label || '') !== 'proves ' + want && bare(String(s.label || '').replace(/^proves /, '')) !== want) continue
    if (typeof s.t !== 'number') return null
    return { from: s.t, to: s.t + (typeof s.d === 'number' ? s.d : 0) }
  }
  return null
}

export function ffmpegClipArgs (srcRel, { from, to }, outRel) {
  const secs = n => String(Math.round(n) / 1000)
  const dur = Math.max(0.4, (to - from) / 1000)
  return [
    '-y', '-ss', secs(from), '-t', String(dur), '-i', srcRel,
    '-an', '-vf', 'scale=640:-2:flags=lanczos,fps=12', '-loop', '0', outRel
  ]
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
    clip: `${dir}/${rid}.clip.webp`
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
// disk stays bounded (deterministic paths overwrite in place; only a path the new entry dropped,
// e.g. a stale clip when this fold cut none, needs pruning).
export function foldEvidence (index, entries) {
  const prune = []
  for (const [qid, e] of Object.entries(entries || {})) {
    const i = String(qid).indexOf(':')
    if (i < 1) continue                       // never invent a screen for an unqualified id
    const scr = qid.slice(0, i)
    const rid = qid.slice(i + 1)
    const entry = (index[scr] ??= {})
    const old = entry.evidence?.[rid]
    entry.evidence = { ...(entry.evidence || {}), [rid]: e }
    if (old) {
      const kept = new Set([e.before, e.after, e.clip].filter(Boolean))
      for (const p of [old.before, old.after, old.clip]) {
        if (p && !kept.has(p)) prune.push(p)
      }
    }
  }
  return prune
}
