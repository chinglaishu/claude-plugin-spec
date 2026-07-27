import { test, expect } from '@playwright/test'

// Gate B only exists once a screenshot exists, and a screenshot only exists because a test made
// one. These specs therefore depend on spec/board/screen.png having been produced by the board
// spec — which is the dependency the design intends, not an accident of ordering.

test('R1 — the approved design and the built screen are shown side by side', async ({ page, request }) => {
  await request.post('/api/gate', { data: { screen: 'board', gate: 'screen', act: 'unapprove' } })
  await page.goto('/#/board')
  const dt = page.locator('.dt[data-i="0"]')
  await expect(dt).toBeVisible()

  // assert on identity, not on a count — a count breaks every time a column is added
  const design = dt.locator('.dtp', { hasText: '2 · Draft' })
  const built = dt.locator('.dtp', { hasText: '3 · Screen' })
  await expect(design).toHaveCount(1)
  await expect(built).toHaveCount(1)
  const db = await design.boundingBox()
  const bb = await built.boundingBox()
  expect(bb!.x).toBeGreaterThan(db!.x)
  // the built screen is a real image, not a placeholder
  const img = built.locator('img')
  await expect(img).toHaveAttribute('src', /screen\.png/)
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(100)
})

test('R4 — approving pins the draft hash the screen was checked against', async ({ page, request }) => {
  await request.post('/api/gate', { data: { screen: 'board', gate: 'screen', act: 'unapprove' } })
  await page.goto('/#/board')
  const bar = page.locator('.dt[data-i="0"] .gb')
  await expect(bar).toContainText('Nobody has checked the built screen')

  await bar.locator('[data-act="approve"][data-gate="screen"]').click()
  await page.waitForLoadState('load')
  const after = page.locator('.dt[data-i="0"] .gb')
  await expect(after).toContainText('matches the approved design')
  await expect(after.locator('code')).toHaveText(/^draft [0-9a-f]{12}$/)
})

test('R5 — rejecting has to name which side is wrong', async ({ request }) => {
  const empty = await request.post('/api/gate', {
    data: { screen: 'board', gate: 'screen', act: 'reject', why: '  ' }
  })
  expect(empty.status()).toBe(400)

  const real = await request.post('/api/gate', {
    data: { screen: 'board', gate: 'screen', act: 'reject', why: 'The build lost the group headers.' }
  })
  expect(real.status()).toBe(200)
  expect(await real.json()).toHaveProperty('screenRejections')

  // leave the board approved so the suite is order-independent
  await request.post('/api/gate', { data: { screen: 'board', gate: 'screen', act: 'approve' } })
})

test('R2 — a screen with no screenshot has no gate B to open', async ({ page, request }) => {
  await request.post('/api/gate', { data: { screen: 'init', gate: 'draft', act: 'approve' } })
  await page.goto('/#/init')
  const dt = page.locator('.dt:not([hidden])')
  // no screenshot means no "3 · Screen" panel at all, so there is nothing for gate B to compare
  await expect(dt.locator('.dtp', { hasText: '3 · Screen' })).toHaveCount(0)
  await expect(dt.locator('.gb')).toContainText('build the screen next')
  await page.screenshot({ path: 'spec/gate-screen-review/screen.png', fullPage: false })
})
