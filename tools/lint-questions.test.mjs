// A ## Q question card is a behaviour nobody owns yet — it is NEVER a coverage target. Tagging one
// with checkReq('Q1') is a lint error; a question that no test tags is simply skipped (nothing to
// prove). The requirement framework, the human 2026-09-07.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintIntent } from './proof-integrity.mjs'

const prd = [
  '---', 'screen: todo', '---',
  '### ⑤ mistake path',
  '## R1 — a real rule',
  '- **Given** g', '- **When** w {happy}', '- **Then** t',
  '## Q1 — is delete reversible?',
  '- **Ask** is this a requirement?'
].join('\n')

test('a question card tagged by a test is a lint error', () => {
  const spec = "test('x', async ({ page }) => { await checkReq('Q1', async () => { await proveVisible(x, y, 'l') }) })"
  const rows = lintIntent(prd, spec, { screen: 'todo' })
  const bad = rows.find(r => r.id === 'Q1' && r.ok === false)
  assert.ok(bad, 'a tagged Q1 must produce a failing row')
  assert.match(bad.why, /question/i)
})

test('a question card no test tags is skipped — no row, never a false gap', () => {
  const spec = "test('x', async ({ page }) => { await checkReq('R1', async () => { await proveVisible(x, y, 'l') }) })"
  const rows = lintIntent(prd, spec, { screen: 'todo' })
  assert.equal(rows.some(r => r.id === 'Q1'), false, 'a question is not a requirement — it gets no lint row')
  assert.ok(rows.some(r => r.id === 'R1'), 'the real rule is still linted')
})
