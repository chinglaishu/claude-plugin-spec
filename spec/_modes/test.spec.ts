import { test, expect } from '../_base'
import { readdirSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readScreen, writeState, isWaiting } from '../../tools/spec-store.mjs'
import { build } from '../../tools/build-board.mjs'

// The ENGINE of the two-column board (board R4/R8). A requirement's state is COMPUTED — proven,
// reworded, or unproven — never typed; and the ONE human gate is accepting the requirements. These
// specs prove the derivation and the gate directly against the store, then that the board renders the
// gate and NO gate B. The wireframe left the tool: there is no draft gate and no "did you build it"
// gate anywhere. (This is a `_`-prefixed pseudo-screen: Playwright runs it, but it is not a row.)
//
// Fixtures are `probe-` screens. This file sorts BEFORE board/ (an underscore beats a letter), so a
// leftover would be a phantom row while the board specs assert exact counts — clean up after EACH test
// and rebuild to the real board (the state guard also sweeps any new dir at teardown).

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')

test.afterEach(() => {
  let removed = false
  for (const n of readdirSync(SPEC))
    if (n.startsWith('probe-') && statSync(join(SPEC, n)).isDirectory()) {
      rmSync(join(SPEC, n), { recursive: true, force: true }); removed = true
    }
  if (removed) build()
})

// A screen with one requirement. `accepted` pins the current PRD text as the accepted source of
// truth, exactly as the accept gate does — so nothing reads reworded until the text moves.
function makeScreen (name: string, body = 'One behaviour, asserted by a test.', { accepted = true } = {}) {
  const dir = join(SPEC, name); mkdirSync(dir, { recursive: true })
  const prd = `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n---\n\n## R1 — A first requirement\n\n${body}\n`
  writeFileSync(join(dir, 'prd.md'), prd)
  if (accepted) writeState(name, { approvedPrdText: prd })
  return { name, dir, prd }
}
// A fresh, far-future passing result for this screen's R1 — fed straight to readScreen, so no
// _results-index.json on disk is touched. Far-future so it is never counted stale against the source.
const passResult = (name: string) =>
  ({ [name]: { ranAt: Date.now() + 100000, tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }] } })

const rework = (dir: string, name: string, body: string) => writeFileSync(join(dir, 'prd.md'),
  `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n---\n\n## R1 — A first requirement\n\n${body}\n`)

// ── the three requirement states (board R4) ───────────────────────────────
test('unproven — an accepted requirement with no passing test reads unproven, and is not waiting', () => {
  const { name } = makeScreen('probe-unproven')
  const s = readScreen(name)!
  expect(s.reqs[0].state).toBe('unproven')   // no passing assertion covers it — honestly ungreen
  expect(isWaiting(s)).toBe(false)           // accepted, nothing reworded — off your queue
})

test('proven — a current passing proof makes a requirement proven', () => {
  const { name } = makeScreen('probe-proven')
  const s = readScreen(name, passResult(name) as any)!
  expect(s.reqs[0].state).toBe('proven')
})

test('reworded — editing the requirement after acceptance wins over any proof, and it is waiting', () => {
  const { name, dir } = makeScreen('probe-reworded')
  rework(dir, name, 'The behaviour changed since it was accepted.')
  // even WITH a passing proof, reworded WINS (board R4): an old pass proves only the old text
  const s = readScreen(name, passResult(name) as any)!
  expect(s.reqs[0].state).toBe('reworded')
  expect(isWaiting(s)).toBe(true)
})

test('never accepted / a guess — both are waiting on you to accept the requirements', () => {
  const fresh = makeScreen('probe-fresh', 'Never accepted.', { accepted: false })
  expect(isWaiting(readScreen(fresh.name)!)).toBe(true)

  const g = join(SPEC, 'probe-guess'); mkdirSync(g, { recursive: true })
  writeFileSync(join(g, 'prd.md'),
    '---\nscreen: probe-guess\narea: Crawled\ntitle: probe-guess\nroute: /pg\nguess: true\n---\n\n## R1 — read off the page\n\nA guess.\n')
  const gs = readScreen('probe-guess')!
  expect(gs.guess).toBe(true)
  expect(isWaiting(gs)).toBe(true)
})

// ── the ONE gate: accept the requirements (board R8) ───────────────────────
test('accept — pins the current PRD text, clears reworded, and leaves the screen not waiting', async ({ request }) => {
  const { name, dir } = makeScreen('probe-accept')
  rework(dir, name, 'Reworded after acceptance.')
  build()
  expect(readScreen(name)!.reqs[0].state).toBe('reworded')

  const res = await request.post('/api/gate', { data: { screen: name, gate: 'prd', act: 'accept' } })
  expect(res.ok()).toBe(true)

  const after = readScreen(name)!
  expect(after.reqs[0].state).not.toBe('reworded')  // re-derives from its tests alone (here: unproven)
  expect(after.state.approvedPrdText).toBeTruthy()   // the current text is pinned
  expect(isWaiting(after)).toBe(false)               // the gate has closed
})

test('accept — strips a crawl guess flag and pins, without touching a body line that begins "guess:"', async ({ request }) => {
  const name = 'probe-accept-guess'
  const dir = join(SPEC, name); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${name}\narea: Crawled\ntitle: X\nroute: /x\nguess: true\n---\n\n## R1 — A requirement\n\nguess: this body line starts with the word and must survive accept.\n`)
  build()
  expect(readScreen(name)!.guess).toBe(true)

  const res = await request.post('/api/gate', { data: { screen: name, gate: 'prd', act: 'accept' } })
  expect(res.ok()).toBe(true)
  const after = readScreen(name)!
  expect(after.guess).toBe(false)                                                // frontmatter flag gone — canon now
  expect(after.prdText).toContain('guess: this body line starts with the word')  // prose kept intact
  expect(after.state.approvedPrdText).toBeTruthy()
})

test('accept — refused when there is nothing to accept (already accepted, nothing reworded)', async ({ request }) => {
  const { name } = makeScreen('probe-accept-noop')
  const res = await request.post('/api/gate', { data: { screen: name, gate: 'prd', act: 'accept' } })
  expect(res.status()).toBe(400)
})

// ── the board renders the ONE gate and two panes, and NO gate B (board R2/R7/R8) ──
async function settleAt (page: any, url: string, ready: any) {
  // Re-assert the board each retry — the watcher can stale-overwrite board.html (a rebuild it began
  // before the fixture landed, finishing late) and never self-correct. A fresh in-process build is the
  // last writer once the file events settle, so goto lands on a board that has this fixture.
  await expect(async () => {
    build()
    await page.goto(url)
    await expect(ready).toBeVisible()
  }).toPass({ timeout: 15000 })
}

test('renders — the detail shows exactly one accept gate, two panes, and no gate B / draft gate', async ({ page }) => {
  const { name } = makeScreen('probe-render', 'One behaviour.', { accepted: false })  // waiting → gate open
  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('[data-act="accept"]'))
  await expect(dt.locator('.gate')).toHaveCount(1)                   // exactly one gate (board R8)
  await expect(dt.locator('.cols .pane')).toHaveCount(2)             // two columns (board R2)
  // no "did you build it" gate, no draft gate, no wireframe anywhere
  await expect(dt.getByText(/Matches the design|approved design|Open draft/i)).toHaveCount(0)
  await expect(dt.locator('[data-gate="screen"]')).toHaveCount(0)
  await expect(dt.locator('iframe')).toHaveCount(0)
})

test('renders — accepting from the board pins the requirements (the gate is a real wire)', async ({ page }) => {
  const { name, dir } = makeScreen('probe-render-accept')
  rework(dir, name, 'Reworded, so the gate is open.')
  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  const acceptBtn = dt.locator('[data-act="accept"]')
  await settleAt(page, '/#/' + name, acceptBtn)
  // applyGate is synchronous on the server (it pins and rebuilds before it responds), so waiting for
  // the POST response is the deterministic signal the pin is done.
  const [resp] = await Promise.all([
    page.waitForResponse((r: any) => r.url().includes('/api/gate') && r.request().method() === 'POST'),
    acceptBtn.click()
  ])
  expect(resp.ok()).toBe(true)
  expect(readScreen(name)!.state.approvedPrdText).toBeTruthy()
})
