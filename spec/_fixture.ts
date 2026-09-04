import { writeFileSync, mkdirSync, copyFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
// The server serves board.html as a static file, so regenerating it on disk from the test process
// is enough for the running server to serve the fresh board — no rebuild endpoint needed, and the
// module-cache trap that forbids the SERVER importing the builder does not apply to a test process.
import { build } from '../tools/build-board.mjs'
// the production drawing pass's own two halves (phase 7): the behaviour parser the board reads a
// requirement with, and the archetype kit tools/viz-derive.mjs draws a no-UI screen's sketch with
import { parseBehavior } from '../tools/behavior.mjs'
import { deriveSchematic } from '../tools/viz.mjs'

// A drafted-but-unbuilt screen, created on demand. Two gate specs need one — a screen with a PRD
// and a draft but no screenshot — to prove that gate A holds the bar until a build exists and gate
// B has nothing to open. `init` used to be that screen by accident; then init got built, and both
// specs broke. A precondition a test needs is a precondition the test should make (trap #8), not
// one it borrows from whatever else happens to be unfinished today.
//
// The state guard snapshots the set of screen directories at setup and removes any that appeared
// during the run, so this leaves nothing behind — no dir, no state.json, no board row.

const SPEC = dirname(fileURLToPath(import.meta.url))

export async function makeUnbuiltScreen (request: APIRequestContext, name: string) {
  const dir = join(SPEC, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n---\n\n` +
    '## R1 — A requirement so the PRD cell is not empty\n\nOne behaviour, so this reads as a real screen.\n')
  // an authored draft, small and self-contained, links the shared sheet like every other draft
  writeFileSync(join(dir, 'draft.html'),
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../_design.css">' +
    `<div class="page"><h1>${name}</h1><button class="btn">a control</button></div>`)
  // approving gate A rebuilds the board with this screen in it — the same call the UI makes
  const res = await request.post('/api/gate', { data: { screen: name, gate: 'draft', act: 'approve' } })
  if (!res.ok()) throw new Error(`could not stand up fixture ${name}: ${await res.text()}`)
  return name
}

// A DOCUMENT-MODE screen: a PRD (a drafted requirement, canon the moment it is written — the human,
// 2026-08-17), the screen as it looks now, and a test — but no wireframe. This is what kg-init lands
// for an existing app: PRD + screen + E2E, no draft. It exists to prove the two-mode state machine,
// since specboard's own six screens are all design mode. `screen.png` is copied from a real one so the
// row renders a genuine image; the test file only has to EXIST for the E2E column to leave `waiting`.
// Rebuilds the board so the row is on it. The state guard removes the directory (it did not exist
// before the run), so this leaves nothing behind.
export function makeDocumentScreen (name: string) {
  const dir = join(SPEC, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${name}\narea: Crawled\ntitle: ${name}\nroute: /${name}\n---\n\n` +
    '## R1 — A requirement read off the running page\n\nOne behaviour the crawl inferred, so this reads as a real screen.\n')
  writeFileSync(join(dir, 'test.spec.ts'),
    "import { test, expect } from '../_base'\n\n" +
    `test('${name} — the existing screen still does what the PRD says', async ({ page }) => {\n` +
    '  // a characterization test: it locks in current behaviour as the baseline\n' +
    `  await page.goto('/${name}')\n  expect(true).toBe(true)\n})\n`)
  // the current screenshot — column 3 is a byproduct of a test, so we copy a real shot rather than
  // author one; a document-mode screen never draws a wireframe of itself
  copyFileSync(join(SPEC, 'board', 'screen.png'), join(dir, 'screen.png'))
  build()
  return name
}

// Drop a wireframe onto an existing screen — the "add a wireframe to redesign" move that flips a
// document-mode screen into design mode. Rebuilds so the board reflects the new mode.
export function addWireframe (name: string) {
  const dir = join(SPEC, name)
  writeFileSync(join(dir, 'draft.html'),
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../_design.css">' +
    `<div class="page"><h1>${name} — redesigned</h1><button class="btn">a new control</button></div>`)
  build()
  return name
}

// A GREENFIELD screen: a PRD and nothing else. No draft, no screen, no test — the day-one design-mode
// screen that has not been started. It must keep reading exactly as it does today (draft missing,
// screen/E2E waiting), which is the invariant the two-mode change must not break.
export function makeGreenfieldScreen (name: string) {
  const dir = join(SPEC, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n---\n\n` +
    '## R1 — A requirement, not yet drafted\n\nOne behaviour, waiting for a wireframe.\n')
  return name
}

// A NO-UI SCREEN WITH A SKETCH (phase 7, 2026-09-04): a PRD with a real Given/When→Then and its
// archetype drawing, and nothing else — no test, no screenshot, no harvest, so no replica anywhere.
// This is the state every screen starts in, and the one this repo's own four screens have all grown
// out of: each of them is harvested, so the borrowed-chrome case cannot be observed on any of them.
//
// The sketch is DERIVED by the production pass (tools/viz-derive.mjs deriveSchematic), never
// authored here — a hand-written svg would prove the reader renders a fixture, not that it renders
// what the kit draws. The behaviour is written to fit an archetype on purpose (open → reveal); it
// throws rather than returning a screen with no drawing, so a kit change that stops fitting this
// sentence fails loudly instead of quietly skipping the case.
export function makeSketchScreen (name: string) {
  const dir = join(SPEC, name)
  mkdirSync(dir, { recursive: true })
  const body = '## R1 — The plan opens in full\n\n' +
    '- **Given** a saved plan\n' +
    '- **When** you open its detail\n' +
    '- **Then** the whole plan opens — every step it holds, each by name, in full — not a truncated summary\n'
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${name}\narea: Core\ntitle: A screen with no UI yet\nroute: /${name}\n---\n\n` + body)
  const drawn = deriveSchematic(parseBehavior(body))
  if (!drawn) throw new Error(`no archetype fits ${name}'s behaviour — the fixture cannot make a sketch`)
  mkdirSync(join(dir, 'viz'), { recursive: true })
  writeFileSync(join(dir, 'viz', 'R1.svg'), drawn.svg + '\n')
  build()
  return name
}

// THE TREE'S OWN SHAPE, read off the disk — an AUTHORED fact (spec/<screen>/prd.md is the source of
// truth), computed here so no GIVEN pins "4 screens, 3 areas" as a literal (Task 7 review A2-a: the
// board and init fixtures each carried that pin, and a fifth screen would have broken three tests in
// three places). A screen is a directory with a prd.md; its area is the frontmatter's `area`.
export function treeShape (): { screens: number, areas: number } {
  const SPEC = join(dirname(fileURLToPath(import.meta.url)))
  const areas = new Set<string>()
  let screens = 0
  for (const name of readdirSync(SPEC)) {
    const prd = join(SPEC, name, 'prd.md')
    if (name.startsWith('_') || !existsSync(prd)) continue
    screens++
    const m = readFileSync(prd, 'utf8').match(/^area:\s*(.+)$/m)
    areas.add(m ? m[1].trim() : 'Other')
  }
  return { screens, areas: areas.size }
}
