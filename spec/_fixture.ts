import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
// The server serves board.html as a static file, so regenerating it on disk from the test process
// is enough for the running server to serve the fresh board — no rebuild endpoint needed, and the
// module-cache trap that forbids the SERVER importing the builder does not apply to a test process.
import { build } from '../tools/build-board.mjs'

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

// A DOCUMENT-MODE screen: a PRD (a crawled guess), the screen as it looks now, and a test — but no
// wireframe. This is what kg-init lands for an existing app: PRD + screen + E2E, no draft. It exists
// to prove the two-mode state machine, since specboard's own six screens are all design mode.
// `screen.png` is copied from a real one so the row renders a genuine image; the test file only has
// to EXIST for the E2E column to leave `waiting`. Rebuilds the board so the row is on it. The state
// guard removes the directory (it did not exist before the run), so this leaves nothing behind.
export function makeDocumentScreen (
  name: string, { guess = true }: { guess?: boolean } = {}
) {
  const dir = join(SPEC, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${name}\narea: Crawled\ntitle: ${name}\nroute: /${name}\n` +
    (guess ? 'guess: true\n' : '') + '---\n\n' +
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
