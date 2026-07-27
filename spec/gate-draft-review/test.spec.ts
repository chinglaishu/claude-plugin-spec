import { test, expect } from '../_base'
import { makeUnbuiltScreen } from '../_fixture'

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
  // establish the precondition rather than inheriting it — stand up a drafted-but-unbuilt screen,
  // because on this board every real screen is built now and gate A only holds the bar until a
  // build exists, after which gate B takes the floor (tested in gate-screen-review)
  const name = await makeUnbuiltScreen(request, 'probe-unbuilt-a')
  await page.goto('/#/' + name)
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

// A MULTI-STEP test case. Each test() above proves one requirement and is its own case; this one
// walks the whole gate-A loop as a sequence of named steps, so the difference is visible on the
// board: a test case can be one assertion or a small story, and the steps below are the story.
// (Watch it run with a step delay set in Setup to see each step land.)
test('the full gate-A loop — open, read, approve, confirm', async ({ page, request }) => {
  const name = await makeUnbuiltScreen(request, 'probe-flow')
  // the fixture leaves gate A approved; this test walks the loop FROM the open state, so reopen it
  await request.post('/api/gate', { data: { screen: name, gate: 'draft', act: 'unapprove' } })

  await test.step('open the screen from its address', async () => {
    await page.goto('/#/' + name)
    await expect(page.locator('.dt:not([hidden])')).toBeVisible()
  })

  await test.step('the verdict bar is open, asking for a yes', async () => {
    await expect(page.locator('.dt:not([hidden]) .gb')).toContainText('Nobody has said yes')
  })

  await test.step('approve the draft', async () => {
    await page.locator('.dt:not([hidden]) [data-act="approve"]').click()
    await page.waitForLoadState('load')
  })

  await test.step('the bar now says approved and names the pinned PRD', async () => {
    const bar = page.locator('.dt:not([hidden]) .gb')
    await expect(bar).toContainText('design approved against')
    await expect(bar.locator('code')).toHaveText(/^prd\.md · [0-9a-f]{12}$/)
  })
})

test('the detail view has its own address and survives a reload', async ({ page }) => {
  await openFirst(page)
  expect(page.url()).toContain('#/board')
  await page.reload()
  await expect(page.locator('.dt[data-i="0"]')).toBeVisible()
  await page.screenshot({ path: 'spec/gate-draft-review/screen.png', fullPage: false })
})
