// gridProof renders a Grid row's proof cell. It must AGREE with the row's status chip: the chip is
// r.status, the board-wide fold that is fail-wins (deriveReqStatus) — a requirement covered by two
// live tests where ONE fails reads Failed. So the proof cell must NOT show a green "✓ proved by"
// beside a Failed chip just because some OTHER covering test passed (rule 3, never look greener than
// you are; Focus's .fpby already keys off r.status the same way). Pure function, unit-testable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gridProof } from './build-board.mjs'

test('a Failed requirement leads with the failure, even when another covering test passed', () => {
  // fail-wins: r.status is 'failed'; r.tests carries BOTH a live pass and a live fail.
  const r = {
    status: 'failed',
    tests: [
      { title: 'the green one', screen: 'board', status: 'pass', stale: false },
      { title: 'the red one', screen: 'board', status: 'fail', stale: false }
    ]
  }
  const h = gridProof(r, 'board')
  assert.doesNotMatch(h, /✓ proved by/)          // NEVER a green proved-by beside a Failed chip
  assert.match(h, /✗ covered by the red one .*failed/)  // leads with the failing test
})

test('a Passed requirement shows the green proved-by, naming a live passing test', () => {
  const r = { status: 'passed', tests: [{ title: 'the prover', screen: 'board', status: 'pass', stale: false }] }
  assert.match(gridProof(r, 'board'), /✓ proved by the prover/)
})

test('a not-reached requirement reads not-reached, not proved', () => {
  const r = { status: 'not-reached', tests: [{ title: 't', screen: 'board', status: 'not-reached', stale: false }] }
  const h = gridProof(r, 'board')
  assert.doesNotMatch(h, /✓ proved by/)
  assert.match(h, /◌ covered by t .*not reached/)
})

test('a stale-only pass (status untested) reads honestly stale, never green', () => {
  const r = { status: 'untested', tests: [{ title: 't', screen: 'board', status: 'pass', stale: true }] }
  const h = gridProof(r, 'board')
  assert.doesNotMatch(h, /✓ proved by/)
  assert.match(h, /○ covered by t .*stale/)
})

test('no covering test reads the honest no-coverage note', () => {
  assert.match(gridProof({ status: 'untested', tests: [] }, 'board'), /no test asserts this yet/)
})

test('a cross-screen prover names its screen', () => {
  const r = { status: 'passed', tests: [{ title: 'a flow', screen: 'dispatch', status: 'pass', stale: false }] }
  assert.match(gridProof(r, 'board'), /· dispatch/)
})
