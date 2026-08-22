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
// This shell is the ONLY writer; viz.mjs stays pure. The board never runs this — a drawing is
// derived authored content, committed like code (the schematics spec's storage decision).

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { allScreens, SPEC } from './spec-store.mjs'
import { deriveSchematic } from './viz.mjs'

const pick = process.argv.slice(2)
const screens = allScreens().filter(s => !pick.length || pick.includes(s.name))
const today = new Date().toISOString().slice(0, 10)
const stampAt = svg => svg.replace('<svg ', `<svg data-viz-at="${today}" `)

let wrote = 0
for (const s of screens) {
  const dir = join(SPEC, s.name, 'viz')
  const seen = new Set()
  for (const r of s.reqs) {
    seen.add(`${r.id}.svg`)
    if (!r.behavior) continue
    const d = deriveSchematic(r.behavior)
    const p = join(dir, `${r.id}.svg`)
    if (!d) {
      console.log(`  · ${s.name}/${r.id} — no archetype fits; text-only (honest)` +
        (existsSync(p) ? ' — NOTE: a committed drawing exists and now reads stale' : ''))
      continue
    }
    if (existsSync(p)) {
      // up to date = the file's BODY is what the kit draws for this text today (minus the date
      // stamp) — a text-hash match alone let a kit change (Task 7 review A1-a: the fold-into-rows
      // "stays" variant) never land, because the text had not moved
      const cur = readFileSync(p, 'utf8').replace(/ data-viz-at="[^"]*"/, '').trim()
      if (cur === d.svg.trim()) {
        console.log(`  = ${s.name}/${r.id} — up to date (${d.archetype})`)
        continue
      }
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(p, stampAt(d.svg) + '\n')
    console.log(`  ✎ ${s.name}/${r.id} — drawn (${d.archetype})`)
    wrote++
  }
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.svg') && !seen.has(f)) console.log(`  ! ${s.name}/viz/${f} — orphan: no such requirement`)
    }
  }
}
console.log(`${wrote} drawing(s) written`)
