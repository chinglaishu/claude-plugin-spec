import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTestPlan } from './spec-store.mjs'

// The board shows a test's steps read from its DEFINITION, so the full plan is visible before the
// test has ever run (board R10). parseTestPlan turns a spec file into the ordered plan per test.

test('a flowStep test plans its numbered story steps; nested checkReq is detail, not a plan step', () => {
  const src = `
import { test, flowStep, checkReq } from '../_base'
test('Persistence round trip — saved plan lands', async ({ page }) => {
  await flowStep('Check the starting point — schedule reads 40,000', async () => {
    await checkReq('R14', async () => {})
  })
  await flowStep('Edit the draft — change Net Rent 40,000 to 60,000', async () => {})
})
`
  const plans = parseTestPlan(src)
  assert.equal(plans.length, 1)
  assert.equal(plans[0].title, 'Persistence round trip — saved plan lands')
  assert.deepEqual(plans[0].steps, [
    { kind: 'flow', text: 'Check the starting point — schedule reads 40,000' },
    { kind: 'flow', text: 'Edit the draft — change Net Rent 40,000 to 60,000' }
  ])
})

test('a checkReq-only test plans one step per requirement it proves, in order', () => {
  const src = `
test('The detail opens as two independent columns', async ({ page }) => {
  await coverReqs('R2')
  await checkReq('R2', async () => {})
})
test('A test opens to its evidence', async ({ page }) => {
  await checkReq('R10', async () => {})
})
`
  const plans = parseTestPlan(src)
  assert.equal(plans.length, 2)
  assert.deepEqual(plans[0].steps, [{ kind: 'prove', id: 'R2' }])
  assert.deepEqual(plans[1].steps, [{ kind: 'prove', id: 'R10' }])
})

test('titles and step text survive double quotes and an apostrophe', () => {
  const src = `
test("A requirement expands; a test leads with its flow name", async ({ page }) => {
  await flowStep("Edit a draft unit's Net rent", async () => {})
})
`
  const plans = parseTestPlan(src)
  assert.equal(plans[0].title, 'A requirement expands; a test leads with its flow name')
  assert.deepEqual(plans[0].steps, [{ kind: 'flow', text: "Edit a draft unit's Net rent" }])
})
