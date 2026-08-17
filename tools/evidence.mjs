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
