// tools/viz-derive.mjs — the viz pass's shell: derive and commit the drawn schematics.
//
//   node tools/viz-derive.mjs             # every screen
//   node tools/viz-derive.mjs board init  # just these screens
//
// For each requirement whose behavior chain fits an archetype (tools/viz.mjs — pure, unit-tested),
// writes spec/<screen>/viz/<id>.svg stamped with the behavior-text hash and today's date. A file
// whose stamp already matches the current text is left byte-untouched (nothing to redraw); a stale
// one is re-derived in place — "redraw is instant and free" for the archetype kit. Requirements
// that fit no archetype are REPORTED, never faked: they stay text-only until the model-fallback
// pass (phase 3, not this tool). Orphan drawings (a viz file whose requirement is gone) are
// reported too, not deleted — removing one is a staff decision made with eyes open.
//
// THE MIRROR COMES FIRST (the human, 2026-08-28). Where the harvest captured the real screen's
// layout skeleton around the requirement's assertion —
// spec/<screen>/evidence/<id>.before.layout.json and .after.layout.json (spec/_base.ts snapLayout,
// folded by spec/_results-reporter.mjs) — the drawing is a WIREFRAME OF THE REAL UI
// (renderWireframe), not an archetype: the same boxes in the same places, the asserted element
// ringed and carrying the value the assertion read. The archetype kit is the fallback for
// everything no run has measured yet. Same output path, same stamps, so build-board consumes it
// unchanged; the up-to-date check below is a BODY comparison, so it already keys on the layout
// files' content — a re-harvest that moves the geometry moves the drawing (the file also carries
// its layout pin as data-viz-layout, so the reason is readable on disk).
//
// This shell is the ONLY writer; viz.mjs stays pure. The board never runs this — a drawing is
// derived authored content, committed like code (the schematics spec's storage decision).

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { allScreens, SPEC } from './spec-store.mjs'
import { deriveSchematic, renderWireframe } from './viz.mjs'

const pick = process.argv.slice(2)
const screens = allScreens().filter(s => !pick.length || pick.includes(s.name))
const today = new Date().toISOString().slice(0, 10)
const stampAt = svg => svg.replace('<svg ', `<svg data-viz-at="${today}" `)

// The harvested layout skeleton for one BEAT's phase, or null. Malformed JSON is a missing
// capture, never a crash: viz.mjs then falls back to the archetype kit.
const layoutOf = (screen, id, n, phase) => {
  const p = join(SPEC, screen, 'evidence', `${id}.b${n}.${phase}.layout.json`)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}
// The whole harvest for a requirement, IN BEAT ORDER — one {before, after} per beat that ran. The
// drawing takes one frame per scene from this (the given frame is beat 1's before, each beat's
// frame is that beat's after), which is exactly what the board's per-beat rows show. Reading stops
// at the first beat with nothing: a gap in the middle is a harvest that never happened.
const beatLayouts = (screen, id, max) => {
  const out = []
  for (let n = 1; n <= max; n++) {
    const before = layoutOf(screen, id, n, 'before')
    const after = layoutOf(screen, id, n, 'after')
    if (!before && !after) break
    out.push({ before, after })
  }
  return out
}

// says WHICH source drew it, so a pass reads at a glance as mirror-or-archetype
const how = d => (d.kind === 'wireframe' ? ' · mirrors the real UI' : '')

let wrote = 0
for (const s of screens) {
  const dir = join(SPEC, s.name, 'viz')
  const seen = new Set()
  for (const r of s.reqs) {
    seen.add(`${r.id}.svg`)
    // the MIRROR first: a measured layout beats a guessed archetype every time (2026-08-28). A
    // requirement with layouts needs no behavior block at all — the drawing comes from the screen.
    const nbeats = (r.behavior && r.behavior.beats && r.behavior.beats.length) || 12
    const lays = beatLayouts(s.name, r.id, nbeats)
    const mirror = lays.length ? renderWireframe(lays, { behavior: r.behavior }) : null
    if (!mirror && !r.behavior) continue
    const d = mirror || deriveSchematic(r.behavior)
    const p = join(dir, `${r.id}.svg`)
    if (!d) {
      console.log(`  · ${s.name}/${r.id} — no archetype fits and no layout harvested; text-only (honest)` +
        (existsSync(p) ? ' — NOTE: a committed drawing exists and now reads stale' : ''))
      continue
    }
    if (existsSync(p)) {
      // up to date = the file's BODY is what the kit draws for this text today (minus the date
      // stamp) — a text-hash match alone let a kit change (Task 7 review A1-a: the fold-into-rows
      // "stays" variant) never land, because the text had not moved
      const cur = readFileSync(p, 'utf8').replace(/ data-viz-at="[^"]*"/, '').trim()
      if (cur === d.svg.trim()) {
        console.log(`  = ${s.name}/${r.id} — up to date (${d.archetype}${how(d)})`)
        continue
      }
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(p, stampAt(d.svg) + '\n')
    console.log(`  ✎ ${s.name}/${r.id} — drawn (${d.archetype}${how(d)})`)
    wrote++
  }
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.svg') && !seen.has(f)) console.log(`  ! ${s.name}/viz/${f} — orphan: no such requirement`)
    }
  }
}
console.log(`${wrote} drawing(s) written`)
