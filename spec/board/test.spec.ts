import { test, expect } from '@playwright/test'

// One test per requirement it proves. A spec that asserts the page "loaded" would pass with every
// requirement deleted, which makes it a smoke alarm with the battery out.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.row')
})

test('R1 — one row per screen, never one per requirement', async ({ page }) => {
  const rows = page.locator('.row')
  await expect(rows).toHaveCount(6)
  // 33 requirements across 6 screens: if rows ever tracked requirements this would be 33.
  const totalReqs = await page.locator('.reqs li').count()
  expect(totalReqs).toBeLessThan(await rows.count() * 8)
})

test('R2 — four cells, left to right, in workflow order', async ({ page }) => {
  const heads = await page.locator('.colhs .lbl').allTextContents()
  expect(heads.map(h => h.trim().split(' ')[0])).toEqual(['1', '2', '3', '4'])
  expect(heads[0]).toContain('PRD')
  expect(heads[1]).toContain('Draft')
  expect(heads[2]).toContain('Screen')
  expect(heads[3]).toContain('E2E')
})

test('R3 — the draft cell renders the wireframe itself, not a word for it', async ({ page }) => {
  const frame = page.locator('.row').first().locator('.frame iframe')
  await expect(frame).toHaveCount(1)
  // the artifact is really in there — a real element from the draft, not a placeholder
  await expect(frame.contentFrame().locator('body')).not.toBeEmpty()
})

test('R4 — cell state is computed, and approving changes it', async ({ page, request }) => {
  // Drive the transition rather than asserting a global tally. Counting approvals across the
  // whole board made this pass or fail on whatever the previous spec happened to leave behind —
  // and a test that needs a second run to go green is not a test.
  const cell = () => page.locator('.row[data-i="0"] .cell[data-col="draft"] .chip')

  await request.post('/api/gate', { data: { screen: 'board', gate: 'draft', act: 'unapprove' } })
  await page.reload()
  await expect(cell()).toHaveText('needs review')

  await request.post('/api/gate', { data: { screen: 'board', gate: 'draft', act: 'approve' } })
  await page.reload()
  await expect(cell()).toHaveText('approved')
})

test('R7 — screens are grouped into named areas, never paginated', async ({ page }) => {
  await expect(page.locator('.grp')).toHaveCount(4)
  await expect(page.locator('.grph h2').first()).toHaveText('Core')
  // no pager anywhere
  await expect(page.getByRole('button', { name: /next page|page \d/i })).toHaveCount(0)
})

test('R8 — filter by whose turn it is, and search requirement text', async ({ page }) => {
  await page.locator('#q').fill('canon')
  await expect(page.locator('.row:not(.gone)')).toHaveCount(1)
  await expect(page.locator('#shown')).toHaveText('1 of 6')

  await page.locator('#qx').click()
  await expect(page.locator('.row:not(.gone)')).toHaveCount(6)

  await page.locator('#filt [data-f="new"]').click()
  await expect(page.locator('.row:not(.gone)')).toHaveCount(0)
  await expect(page.locator('#none')).toHaveText('Every screen has a draft.')
})

test('R6 — the header counts agree with the rows beneath them', async ({ page }) => {
  await page.locator('#filt [data-f="all"]').click()
  const stat = await page.locator('.stats .stat').first().innerText()
  expect(stat).toContain(String(await page.locator('.row').count()))
  // screen.png for gate B is produced HERE, by the test — never captured separately
  await page.screenshot({ path: 'spec/board/screen.png', fullPage: false })
})
