import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'

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
