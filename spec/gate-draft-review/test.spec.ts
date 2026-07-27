import { test, expect } from '@playwright/test'

// Gate A is the detail view of the board: PRD on the left, draft on the right, verdict beneath.

const openFirst = async (page) => {
  await page.goto('/')
  await page.waitForSelector('.row')
  await page.locator('.row[data-i="0"] .c1').click()
  return page.locator('.dt[data-i="0"]')
}

test('R1 — PRD and wireframe are visible side by side', async ({ page }) => {
  const dt = await openFirst(page)
  await expect(dt).toBeVisible()
  const panels = dt.locator('.dtp')
  // at least PRD and draft; a third appears once the screen has been built and shot
  expect(await panels.count()).toBeGreaterThanOrEqual(2)
  await expect(panels.nth(0)).toContainText('PRD')
  await expect(panels.nth(1)).toContainText('Draft')
  const lb = await panels.nth(0).boundingBox()
  const rb = await panels.nth(1).boundingBox()
  const right = panels.nth(1)
  // genuinely beside each other, not stacked
  expect(rb!.x).toBeGreaterThan(lb!.x + lb!.width - 5)
  await expect(right.locator('iframe')).toHaveCount(1)
})

test('R3 — approving pins the PRD hash, and the bar says which', async ({ page, request }) => {
  // establish the precondition rather than inheriting it — this used to pass or fail on whatever
  // the previous spec left on disk
  await request.post('/api/gate', { data: { screen: 'init', gate: 'draft', act: 'approve' } })
  // a screen with no screenshot yet, so gate A still holds the bar — once a screen is built,
  // gate B takes the floor, which is the correct handoff and tested in gate-screen-review
  await page.goto('/#/init')
  const bar = page.locator('.dt:not([hidden]) .gb')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('design approved against')
  // names the file AND the exact hash — "approved" without saying against what proves nothing
  await expect(bar.locator('code')).toHaveText(/^prd\.md · [0-9a-f]{12}$/)
})

test('R4 — rejecting requires a reason; an empty one is refused', async ({ page, request }) => {
  const res = await request.post('/api/gate', {
    data: { screen: 'board', gate: 'draft', act: 'reject', why: '   ' }
  })
  expect(res.status()).toBe(400)
  expect(await res.text()).toContain('reason')
})

test('R5 — the gate opens by itself when the PRD moves', async ({ page, request }) => {
  // un-approving is the same transition the board makes when a PRD edit invalidates a pin
  await request.post('/api/gate', { data: { screen: 'conflicts', gate: 'draft', act: 'unapprove' } })
  await page.goto('/#/conflicts')
  const bar = page.locator('.dt:not([hidden]) .gb')
  await expect(bar).toContainText('Nobody has said yes')
  await expect(bar.locator('[data-act="approve"]')).toBeVisible()
  await expect(bar.locator('[data-act="reject"]')).toBeVisible()

  // put it back the way we found it
  await request.post('/api/gate', { data: { screen: 'conflicts', gate: 'draft', act: 'approve' } })
})

test('the detail view has its own address and survives a reload', async ({ page }) => {
  await openFirst(page)
  expect(page.url()).toContain('#/board')
  await page.reload()
  await expect(page.locator('.dt[data-i="0"]')).toBeVisible()
  await page.screenshot({ path: 'spec/gate-draft-review/screen.png', fullPage: false })
})
