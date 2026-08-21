// The ONE job slot's close transition, proven as a pure function (node --test; no server).
//
// The board puts every job in one global slot (`running`), with `runStack` holding the ancestors
// of a nested run. Three things end a job's hold: finishing, being cancelled, and being TAKEN OVER
// (dispatch R4, cancel-and-run). The close handler used to pop unconditionally — so a taken-over
// run's close, arriving a beat after the takeover run had already claimed the slot, freed (or
// worse, re-populated) the slot while the successor was still live, and a second concurrent run
// could start: exactly what the slot exists to refuse (Task 15 concern 4; reproduced live
// 2026-08-21). The rule under test: a close releases the slot ONLY when the closing job is the
// current holder; any other close steps out of the chain without touching the holder.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotAfterClose } from './spec-store.mjs'

// jobs are compared by IDENTITY, exactly like the server's captured `myJob` locals
const job = id => ({ runId: id, kind: 'tests' })

test('a plain run finishing frees the slot', () => {
  const a = job('a')
  assert.deepEqual(slotAfterClose(a, a, []), { running: null, runStack: [] })
})

test('a nested run finishing hands the slot back to the run it was nested in', () => {
  const parent = job('p'); const child = job('c')
  assert.deepEqual(slotAfterClose(child, child, [parent]), { running: parent, runStack: [] })
})

test('an agent job finishing frees the slot (the stack is only ever runs)', () => {
  const j = { kind: 'redraft' }
  assert.deepEqual(slotAfterClose(j, j, []), { running: null, runStack: [] })
})

test('THE GUARD — a superseded run\'s close must not free the takeover run\'s slot', () => {
  // takeover (R4): A held the slot, B took it over; A is cancelled and closes a beat later.
  const a = job('a'); a.superseded = true
  const b = job('b')
  const after = slotAfterClose(a, b, [])
  assert.equal(after.running, b, 'B still holds the slot after A\'s late close')
  assert.deepEqual(after.runStack, [])
})

test('THE GUARD, nested — a taken-over NESTED run\'s close must not hand the slot to its ancestor over the live takeover run', () => {
  // S was driving the spec, A nested inside it, B took A over: running=B, stack=[S].
  const s = job('s'); const a = job('a'); a.superseded = true
  const b = job('b')
  const after = slotAfterClose(a, b, [s])
  assert.equal(after.running, b, 'B keeps the slot')
  assert.deepEqual(after.runStack, [s], 'S stays an ancestor, resumed only when B ends')
  // and when B really ends, S resumes — the ancestors survive the takeover (dispatch R4)
  assert.deepEqual(slotAfterClose(b, after.running, after.runStack), { running: s, runStack: [] })
})

test('two takeovers in a row — every superseded close is a no-op, the last run standing frees normally', () => {
  const a = job('a'); a.superseded = true
  const b = job('b'); b.superseded = true
  const c = job('c')
  assert.deepEqual(slotAfterClose(a, c, []), { running: c, runStack: [] })
  assert.deepEqual(slotAfterClose(b, c, []), { running: c, runStack: [] })
  assert.deepEqual(slotAfterClose(c, c, []), { running: null, runStack: [] })
})

test('an ancestor that dies in the stack steps OUT of the chain — never handed the slot back dead', () => {
  // parent P crashed (timeout) while its nested child C holds the slot: P's close must not
  // clobber C, and C's later close must not resurrect the dead P.
  const p = job('p'); const c = job('c')
  const after = slotAfterClose(p, c, [p])
  assert.equal(after.running, c, 'the live child keeps the slot')
  assert.deepEqual(after.runStack, [], 'the dead parent left the chain')
  assert.deepEqual(slotAfterClose(c, after.running, after.runStack), { running: null, runStack: [] })
})

test('pure — the stack passed in is never mutated', () => {
  const s = job('s'); const c = job('c')
  const stack = [s]
  slotAfterClose(c, c, stack)
  assert.deepEqual(stack, [s])
})
