// The deterministic half of a narrated recording. NO model runs here: the words were authored once
// per screen (spec/<screen>/narration.json — the narration pack, with pass AND fail variants), the
// run's beat log says which lines this run earned and when, and these functions turn the two into
// cue times, a subtitle track and an audio layout. narrate-run.mjs is the thin shell around this
// (band scan, piper synth, ffmpeg mux); everything decidable is decided here, unit-tested.
//
// A pack looks like:
//   {
//     "voice": "en_US-lessac-medium",
//     "intro":  { "spoken": "…", "shown": "…" },              // at the start of the video
//     "outro":  { "spoken": "…", "shown": "…" },              // after the last beat
//     "cues": [
//       { "on": "step",     "match": "^1\\.",    "spoken": "…", "shown": "…" },
//       { "on": "req-done", "match": "^R5 pass", "spoken": "…", "shown": "…" },
//       { "on": "req-done", "match": "^R5 fail", "spoken": "…", "shown": "…" }
//     ]
//   }
// `on` is a beat kind (step / req / req-done / step-done / note), `match` a regex on the beat's
// label. Pass and fail are just two entries — the run's own beats choose which one fires, so the
// same pack narrates a green run and a red run truthfully with no model in the loop.

export function parseBeats (jsonl) {
  return String(jsonl).split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
}

// Pick the lines this run earned. Every pack cue fires on the FIRST beat matching (on, match) —
// `nth` picks a later one. A cue whose beat never happened is skipped and REPORTED (a silently
// dropped line is how a narration quietly stops matching its screen).
export function selectCues (beats, pack) {
  const cues = []
  // Pass/fail lines are SIBLING VARIANTS of one moment — `req-done /^R5 pass/` and `/^R5 fail/`
  // group together (the trailing verdict word is stripped), and exactly one of a group is expected
  // to fire. Only a group where NOTHING fired is truly unmatched — a variant whose sibling fired is
  // just the road not taken, and warning about it every run would teach people to ignore warnings.
  const groupOf = (c) => c.group || `${c.on}:${String(c.match).replace(/ ?(pass|fail)\$?$/, '')}`
  const fired = new Set()
  const missed = new Map()
  for (const c of pack.cues || []) {
    const re = new RegExp(c.match)
    const hits = beats.filter(b => b.kind === c.on && re.test(b.label))
    const hit = hits[c.nth || 0]
    if (!hit) { if (!missed.has(groupOf(c))) missed.set(groupOf(c), `${c.on} /${c.match}/`); continue }
    fired.add(groupOf(c))
    // `text` is ONE string for both channels — the subtitle is exactly what the voice says, by
    // construction (separate spoken/shown remain possible, but drift between them is on the author)
    cues.push({ wall: hit.t, spoken: c.text ?? c.spoken, shown: c.text ?? c.shown, lead: c.lead || 0, key: `${c.on}:${c.match}` })
  }
  const unmatched = [...missed.entries()].filter(([g]) => !fired.has(g)).map(([, label]) => label)
  cues.sort((a, b) => a.wall - b.wall)
  if (pack.intro) {
    cues.unshift({ at: 'start', wall: null, spoken: pack.intro.text ?? pack.intro.spoken, shown: pack.intro.text ?? pack.intro.shown, lead: pack.intro.lead || 0, key: 'intro' })
  }
  if (pack.outro) {
    const last = beats[beats.length - 1]
    cues.push({ at: 'end', wall: last ? last.t : 0, spoken: pack.outro.text ?? pack.outro.spoken, shown: pack.outro.text ?? pack.outro.shown, lead: pack.outro.lead || 0, key: 'outro' })
  }
  return { cues, unmatched }
}

// Wall-clock → video seconds. A recording compresses idle stretches (the login of the entity demo
// shrank ~20s of wall into 2.3s of video), so one global offset lies. But the topbar burned into
// the frames is a state machine we control: light until the first flowStep paints it ink, bengara
// exactly when a step's ✗ paints. Pair those known beats with the scanned band transitions and the
// map is piecewise-linear through points that are TRUE, whatever the encoder compressed between.
export function buildAnchors (beats, runs, videoDur) {
  const onsets = { ink: [], red: [] }
  let prev = null
  for (const r of runs) {
    if (prev && r.state !== prev && (r.state === 'ink' || r.state === 'red')) onsets[r.state].push(r.t0)
    if (!prev && r.state !== 'light') onsets[r.state]?.push(r.t0)
    prev = r.state
  }
  const anchors = []
  const firstStep = beats.find(b => b.kind === 'step')
  if (firstStep && onsets.ink.length) anchors.push([firstStep.t, onsets.ink[0]])
  const fails = beats.filter(b => b.kind === 'step-done' && b.label.startsWith('✗'))
  for (let i = 0; i < Math.min(fails.length, onsets.red.length); i++) anchors.push([fails[i].t, onsets.red[i]])
  // monotonic in both axes, inside the video
  anchors.sort((a, b) => a[0] - b[0])
  const clean = []
  for (const [w, v] of anchors) {
    if (v > videoDur) continue
    if (!clean.length || (w > clean[clean.length - 1][0] && v > clean[clean.length - 1][1])) clean.push([w, v])
  }
  return clean
}

export function wallToVideo (anchors) {
  return (wall) => {
    if (!anchors.length) return 0
    if (wall <= anchors[0][0]) return anchors[0][1]
    for (let i = 1; i < anchors.length; i++) {
      const [w0, v0] = anchors[i - 1]; const [w1, v1] = anchors[i]
      if (wall <= w1) return v0 + (wall - w0) / (w1 - w0) * (v1 - v0)
    }
    const [wl, vl] = anchors[anchors.length - 1]
    return vl + (wall - wl) / 1000                       // past the last anchor: 1s wall = 1s video
  }
}

// No line may talk over the next: a cue that would start while the previous one still speaks is
// nudged after it (recorded on the cue, so the caller can warn — a nudge means the run outpaced
// the narration and the pace file should hold that beat longer next run).
export function layoutCues (cues, { gap = 0.25 } = {}) {
  const laid = cues.map(c => ({ ...c }))
  laid.sort((a, b) => a.t - b.t)
  let prevEnd = -Infinity
  for (const c of laid) {
    const want = c.t
    if (want < prevEnd + gap) { c.t = +(prevEnd + gap).toFixed(2); c.nudged = +(c.t - want).toFixed(2) }
    prevEnd = c.t + c.dur
  }
  return { cues: laid, endsAt: +prevEnd.toFixed(2) }
}

const ts = (sec) => {
  let ms = Math.round(sec * 1000)
  const h = Math.floor(ms / 3600000); ms %= 3600000
  const m = Math.floor(ms / 60000); ms %= 60000
  const s = Math.floor(ms / 1000); ms %= 1000
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`
}

// A subtitle lives while its line speaks (+0.4s to finish reading), never into the next line's
// slot and never past the end of the video.
export function toSrt (cues, videoEnd) {
  return cues.map((c, i) => {
    const next = cues[i + 1]
    const end = Math.min(c.t + c.dur + 0.4, next ? next.t - 0.05 : videoEnd, videoEnd)
    return `${i + 1}\n${ts(c.t)} --> ${ts(end)}\n${c.shown}\n`
  }).join('\n')
}

// The BURN-IN track. SRT + force_style renders at libass' default 384×288 PlayRes and scales up,
// and under that scaling BorderStyle=3 boxes mis-measure wrapped lines (v6 shipped a clipped
// sliver of a phantom third line under every two-line subtitle). A native ASS script pins PlayRes
// to the real frame: the size we author is the size that burns, no scaling anywhere. White text on
// an opaque black box, bottom-centre; braces are neutralised (they would read as override tags).
const tsAss = (sec) => {
  let cs = Math.round(sec * 100)
  const h = Math.floor(cs / 360000); cs %= 360000
  const m = Math.floor(cs / 6000); cs %= 6000
  const s = Math.floor(cs / 100); cs %= 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
export function toAss (cues, videoEnd, { width = 1440, height = 900, fontSize = 28, font = 'Helvetica' } = {}) {
  const head =
    '[Script Info]\nScriptType: v4.00+\n' +
    `PlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n` +
    '[V4+ Styles]\n' +
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
    'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, ' +
    'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
    `Style: Sub,${font},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,3,0,2,90,90,26,1\n\n` +
    '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
  const lines = cues.map((c, i) => {
    const next = cues[i + 1]
    const end = Math.min(c.t + c.dur + 0.4, next ? next.t - 0.05 : videoEnd, videoEnd)
    const text = String(c.shown).replace(/\{/g, '(').replace(/\}/g, ')')
    return `Dialogue: 0,${tsAss(c.t)},${tsAss(end)},Sub,,0,0,0,,${text}`
  })
  return head + lines.join('\n') + '\n'
}
