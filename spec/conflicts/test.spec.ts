import { test, expect, checkReq, coverReqs } from '../_base'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The conflicts view reads spec/_conflicts.json, which is written by the scanner — a Claude job
// that takes minutes and costs tokens. Spawning it from the suite would make the suite slow,
// non-deterministic and dependent on a login, so these specs drive the STORE instead: they write
// a known findings file and prove what the tool does with it. The scanner's own precision is a
// judgement about English and is measured by reading its output, not by asserting on it here.
//
// _conflicts.json and _conflict-decisions.json are both restored by the state guard, exactly like
// the approval pins — a test run must not leave a decision behind that nobody made.

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFLICTS = join(SPEC, '_conflicts.json')
const DECISIONS = join(SPEC, '_conflict-decisions.json')

const WIDTH = {
  id: 'canvas-width',
  subject: 'The width a wireframe is authored at',
  a: {
    source: 'spec/board/prd.md · R2',
    quote: 'The canvas is 1280px wide — the width every draft is authored and scaled against.'
  },
  b: {
    source: 'spec/init/prd.md · R2',
    quote: 'The wireframe is generated at 1152px to leave room for the crawl sidebar.'
  },
  impact: '6 screens go stale'
}

const ROW = {
  id: 'row-meaning',
  subject: 'Whether a board row is a screen or a requirement',
  a: { source: 'spec/board/prd.md · R1', quote: 'Each row is one screen; its requirements list inside the card.' },
  b: { source: 'spec/dispatch/prd.md · R1', quote: 'Each row is one requirement, grouped under its screen as a header.' },
  impact: '1 screen goes stale'
}

const seed = (findings: unknown[]) => {
  writeFileSync(CONFLICTS, JSON.stringify({ scannedAt: '2026-07-27T09:00:00.000Z', findings }, null, 2))
  writeFileSync(DECISIONS, '{}\n')
}

const decisions = () => (existsSync(DECISIONS) ? JSON.parse(readFileSync(DECISIONS, 'utf8')) : {})

test('R2 — both positions are shown in full, each naming where it came from', async ({ page }) => {
  seed([WIDTH, ROW])
  await page.goto('/#conflicts')
  const view = page.locator('#cfview')
  await expect(view).toBeVisible()

  const card = view.locator('.cf', { hasText: WIDTH.subject })
  await expect(card).toHaveCount(1)
  // in FULL — not an ellipsis, not a summary. You are picking a winner between two sentences,
  // so both sentences have to be readable without leaving the page.
  await expect(card.locator('.side', { hasText: WIDTH.a.source })).toContainText(WIDTH.a.quote)
  await expect(card.locator('.side', { hasText: WIDTH.b.source })).toContainText(WIDTH.b.quote)
})

test('R3 — the tool never picks: resolving is refused until you choose a side', async ({ page }) => {
  seed([WIDTH])
  await page.goto('/#conflicts')
  const card = page.locator('#cfview .cf', { hasText: WIDTH.subject })

  await expect(card.locator('[data-resolve]')).toBeDisabled()
  expect(decisions()).toEqual({})

  await card.locator('.side', { hasText: WIDTH.b.source }).click()
  await expect(card.locator('[data-resolve]')).toBeEnabled()
  // picking is not deciding — nothing is written until you resolve
  expect(decisions()).toEqual({})
})

test('R4 — resolving records which side lost, stays on Open, and offers the rewrite', async ({ page }) => {
  await coverReqs('R4')
  seed([WIDTH, ROW])                 // a second open conflict — "stay on Open" must leave it in reach
  await page.goto('/#conflicts')
  const card = page.locator('#cfview .cf', { hasText: WIDTH.subject })

  await card.locator('.side', { hasText: WIDTH.a.source }).click()
  await expect(card.locator('[data-resolve]')).toContainText('spec/init/prd.md')
  await card.locator('[data-resolve]').click()

  await checkReq('R4', async () => {
    // the count updating proves the resolve landed and re-rendered — only THEN is the tab
    // assertion meaningful (asserting it straight after the click can pass before the handler runs)
    await expect(page.locator('#cfseg button[data-cf="settled"]')).toContainText('Settled 1')
    // resolving STAYS on the Open list — the next open conflict is right where you were…
    await expect(page.locator('#cfseg button.on')).toHaveAttribute('data-cf', 'open')
    await expect(page.locator('#cfview .cf', { hasText: ROW.subject })).toBeVisible()
    // …and the card left QUIETLY, with a toast naming what was settled
    await expect(page.locator('.toast')).toContainText(WIDTH.subject)

    const rec = Object.values(decisions())[0] as any
    expect(rec.canon).toBe('a')
    expect(rec.won).toBe('spec/board/prd.md')
    expect(rec.lost).toBe('spec/init/prd.md')

    // the settled row, and the rewrite of the loser, live under the Settled tab
    await page.locator('#cfseg button[data-cf="settled"]').click()
    const settled = page.locator('#cfview .srow', { hasText: WIDTH.subject })
    await expect(settled).toBeVisible()
    await expect(settled).toContainText('spec/board/prd.md')
    await expect(settled.locator('[data-rewrite]')).toContainText('spec/init/prd.md')
  })
})

test('R5 — a decision survives a rescan that reorders and swaps the sides', async ({ page }) => {
  seed([WIDTH, ROW])
  await page.goto('/#conflicts')
  const card = page.locator('#cfview .cf', { hasText: WIDTH.subject })
  await card.locator('.side', { hasText: WIDTH.a.source }).click()
  await card.locator('[data-resolve]').click()
  // resolving stays on Open (R4) — the count ticking up is the proof the decision landed
  await expect(page.locator('#cfseg button[data-cf="settled"]')).toContainText('Settled 1')

  // A rescan overwrites the whole file. It may list the findings in a different order, give them
  // different ids, and emit the two sides the other way round — none of which changes the fact
  // you already settled. Keyed by position or by id, every one of those resurrects it.
  writeFileSync(CONFLICTS, JSON.stringify({
    scannedAt: '2026-07-27T11:00:00.000Z',
    findings: [
      ROW,
      { ...WIDTH, id: 'width-of-the-canvas', a: WIDTH.b, b: WIDTH.a }
    ]
  }, null, 2))

  await page.goto('/#conflicts')
  const view = page.locator('#cfview')
  await expect(view.locator('.srow', { hasText: WIDTH.subject })).toHaveCount(1)
  await expect(view.locator('.cf', { hasText: WIDTH.subject })).toHaveCount(0)
  // and the one you never settled is still open, so a rescan is not a way to lose questions
  await expect(view.locator('.cf', { hasText: ROW.subject })).toHaveCount(1)

  await page.screenshot({ path: 'spec/conflicts/screen.png', fullPage: false })
})

test('R5 — undo puts a settled conflict back, and the scanner is never asked to pick', async ({ page, request }) => {
  seed([WIDTH])
  await page.goto('/#conflicts')
  const card = page.locator('#cfview .cf', { hasText: WIDTH.subject })
  await card.locator('.side', { hasText: WIDTH.a.source }).click()
  await card.locator('[data-resolve]').click()

  await page.locator('#cfseg button[data-cf="settled"]').click()   // resolving stays on Open (R4)
  const settled = page.locator('#cfview .srow', { hasText: WIDTH.subject })
  await expect(settled).toBeVisible()
  await settled.locator('[data-undo]').click()

  // undo stays on the Settled list the same way (R4) — the list you were working through
  await checkReq('R4', async () => {
    await expect(page.locator('#cfseg button[data-cf="open"]')).toContainText('Open 1')  // undo landed
    await expect(page.locator('#cfseg button.on')).toHaveAttribute('data-cf', 'settled')
  })
  await page.locator('#cfseg button[data-cf="open"]').click()
  await expect(page.locator('#cfview .cf', { hasText: WIDTH.subject })).toHaveCount(1)
  expect(decisions()).toEqual({})

  // an unknown conflict cannot be settled through the API either — the key is the identity, and
  // a decision recorded against a conflict that does not exist is a decision nobody can see
  const bogus = await request.post('/api/conflict', { data: { key: 'deadbeefdead', canon: 'a' } })
  expect(bogus.status()).toBe(400)
})
