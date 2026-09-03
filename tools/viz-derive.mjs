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
// THE MIRROR IS GONE (phase 4a, the human's Expected View decision of 2026-09-03; corrected here in
// place, rule 6). This header used to read "THE MIRROR COMES FIRST … where the harvest captured the
// real screen's layout skeleton the drawing is a WIREFRAME OF THE REAL UI (renderWireframe), not an
// archetype". It is not: a requirement the run harvested shows the app's OWN markup — the replica
// committed beside its frames — and this pass draws nothing for it at all. Only a requirement with
// no harvest keeps a SKETCH from the archetype kit, and a committed wireframe is deleted whenever
// one is found. The choice is `pictureFor` (tools/viz.mjs, pure and unit-tested), so this shell and
// tools/build-board.mjs cannot answer it differently again.
//
// This shell is the ONLY writer; viz.mjs stays pure. The board never runs this — a drawing is
// derived authored content, committed like code (the schematics spec's storage decision).

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { allScreens, SPEC } from './spec-store.mjs'
import { deriveSchematic, pictureFor } from './viz.mjs'

const pick = process.argv.slice(2)
const screens = allScreens().filter(s => !pick.length || pick.includes(s.name))
const today = new Date().toISOString().slice(0, 10)
const stampAt = svg => svg.replace('<svg ', `<svg data-viz-at="${today}" `)


// THE DRAWN MIRROR IS RETIRED (phase 4a, 2026-09-03 — the human's Expected View decision: "the
// picture beside a proof is a real HTML replica of the app's own component"). A requirement the run
// HARVESTED has the app's own markup to show, so nothing draws a wireframe of it any more: the board
// renders the replica, or says honestly that it has none. A drawing beside a photograph of the same
// component would be a second, worse answer to "what does this look like" — the exact drift this
// product exists to stop. The SKETCH kit (the archetypes, drawn from the sentence) stays for the case
// it was always right for: a requirement with NO harvest at all, where there is no UI to replicate.
//
// The CHOICE itself is `pictureFor` in tools/viz.mjs — pure and unit-tested (the review's I2). It
// used to be stated here as "has a replica on disk", which disagreed with tools/build-board.mjs's
// "never bake a wireframe": a requirement harvested with skeletons whose replica capture failed then
// had a drawing derived, committed and gated that nothing could ever display.
const harvestIndex = screen => {
  const dir = join(SPEC, screen, 'evidence')
  if (!existsSync(dir)) return []
  try { return readdirSync(dir) } catch { return [] }
}
const esc = id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const harvested = (files, id) => {
  // one regex per requirement, not one per filename: a skeleton or a replica of ANY moment means the
  // run photographed this requirement's UI, which is what decides the picture
  const re = new RegExp('^' + esc(id) + '\\.b\\d+\\.(?:before|after|v\\d+)\\.(?:layout\\.json|(?:actual|expected)\\.html)$')
  return files.some(f => re.test(f))
}

let wrote = 0
let retired = 0
for (const s of screens) {
  const dir = join(SPEC, s.name, 'viz')
  const seen = new Set()
  const evFiles = harvestIndex(s.name)
  for (const r of s.reqs) {
    seen.add(`${r.id}.svg`)
    const p = join(dir, `${r.id}.svg`)
    const choice = pictureFor({
      harvested: harvested(evFiles, r.id),
      replicated: false,
      hasBehavior: !!r.behavior
    })
    // A COMMITTED WIREFRAME IS RETIRED, always: nothing bakes one any more (tools/build-board.mjs
    // renderSchematic refuses every one), so a file left on disk is a picture nobody can see that the
    // proof gate can still redden. Deleted here at the fold — deterministic, printed, never silent.
    if (choice.retire && existsSync(p)) {
      let body = ''
      try { body = readFileSync(p, 'utf8') } catch { body = '' }
      if (/data-viz-kind="wireframe"/.test(body)) {
        try { rmSync(p, { force: true }); retired++ } catch { /* already gone */ }
        console.log(`  ✗ ${s.name}/${r.id} — drawn mirror retired; the replica is the Expected picture`)
      }
    }
    if (choice.draw !== 'archetype') continue
    const d = deriveSchematic(r.behavior)
    if (!d) {
      console.log(`  · ${s.name}/${r.id} — no archetype fits and no UI harvested; text-only (honest)` +
        (existsSync(p) ? ' — NOTE: a committed drawing exists and now reads stale' : ''))
      continue
    }
    if (existsSync(p)) {
      // up to date = the file's BODY is what the kit draws for this text today (minus the date
      // stamp) — a text-hash match alone let a kit change (Task 7 review A1-a: the fold-into-rows
      // "stays" variant) never land, because the text had not moved
      const cur = readFileSync(p, 'utf8').replace(/ data-viz-at="[^"]*"/, '').trim()
      if (cur === d.svg.trim()) {
        console.log(`  = ${s.name}/${r.id} — up to date (${d.archetype} · a sketch, not the app)`)
        continue
      }
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(p, stampAt(d.svg) + '\n')
    console.log(`  ✎ ${s.name}/${r.id} — drawn (${d.archetype} · a sketch, not the app)`)
    wrote++
  }
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.svg') && !seen.has(f)) console.log(`  ! ${s.name}/viz/${f} — orphan: no such requirement`)
    }
  }
}
console.log(`${wrote} drawing(s) written` + (retired ? `, ${retired} drawn mirror(s) retired` : ''))
