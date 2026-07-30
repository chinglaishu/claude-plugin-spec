// Two honesty rules for a test run, proven as pure functions (node --test; no server, no browser):
//
//  reEscape  — the board's "run one" passes a test's TITLE to Playwright's -g, which is a REGEX. A
//              title with a bracket, paren or dot (e.g. "... in-cell (before any Run)") is then a
//              regex that does not match its own literal text, so Playwright finds no test and the
//              run reports 0/0. Escaping makes -g match the title literally.
//
//  runVerdict — a run that tested NOTHING is not a pass. "0 of 0 passing" reads green; it must read
//              as the error it is. ok requires the process to have succeeded AND at least one case to
//              have actually run.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reEscape, runVerdict } from './spec-store.mjs'

test('reEscape lets -g match a title with regex-special characters literally', () => {
  const title = "R5 — editing a draft unit's Net rent (before any Run)"
  // escaped, the title matches itself
  assert.ok(new RegExp(reEscape(title)).test(title))
  // and it is the escaping that does it — unescaped, the parens are a group and it does NOT match
  assert.ok(!new RegExp(title).test(title))
})

test('reEscape escapes every regex metacharacter', () => {
  assert.equal(reEscape('a.(b)[c]*d'), 'a\\.\\(b\\)\\[c\\]\\*d')
})

test('a run that passed every case is ok', () => {
  assert.deepEqual(runVerdict(0, 3), { ok: true, note: null })
})

test('a run that matched no cases is NOT a pass, even on a clean exit', () => {
  const v = runVerdict(0, 0)
  assert.equal(v.ok, false)
  assert.match(v.note, /no tests ran/)
})

test('a run Playwright aborted with "no tests found" (exit 1, zero cases) is an error, not 0 of 0 passing', () => {
  const v = runVerdict(1, 0)
  assert.equal(v.ok, false)
  assert.match(v.note, /no tests ran/)
})

test('a run with a failing case is not ok, and carries no zero-test note', () => {
  assert.deepEqual(runVerdict(1, 3), { ok: false, note: null })
})
