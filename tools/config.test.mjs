// The Setup config's clean/merge contract (spec-store.cleanConfig). The load-bearing property: a
// PARTIAL save preserves every field it does not mention — regressed once as "Pace of a watchable
// run keeps resetting to 300" (a save that omitted stepDelayMs wiped it back to the default).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanConfig } from './spec-store.mjs'

const FULL = {
  mode: 'attach',
  baseUrl: 'http://localhost:3000',
  routes: ['/home', '/properties'],
  signIn: 'await page.goto("/login")',
  stepDelayMs: 2000,
  storage: { where: 'git', gitBranch: 'runs', push: true, bucketUrl: '' }
}

test('a partial save PRESERVES the fields it does not mention', () => {
  // The exact bug: the board POSTs only baseUrl; stepDelayMs (and everything else) must survive.
  const out = cleanConfig({ baseUrl: 'http://localhost:4000' }, FULL)
  assert.equal(out.stepDelayMs, 2000, 'stepDelayMs preserved')
  assert.deepEqual(out.routes, ['/home', '/properties'], 'routes preserved')
  assert.equal(out.signIn, 'await page.goto("/login")', 'signIn preserved')
  assert.equal(out.baseUrl, 'http://localhost:4000', 'the provided field wins')
  assert.equal(out.storage.where, 'git', 'storage preserved')
})

test('the incoming stepDelayMs wins, clamped high, and invalid input falls to the default', () => {
  assert.equal(cleanConfig({ stepDelayMs: 1500 }, FULL).stepDelayMs, 1500)
  assert.equal(cleanConfig({ stepDelayMs: 99999 }, FULL).stepDelayMs, 5000, 'clamped high')
  assert.equal(cleanConfig({ stepDelayMs: 0 }, FULL).stepDelayMs, 0, 'an explicit 0 (as-fast-as-it-can) is kept, not defaulted')
  // Invalid input (a negative pace, empty string, garbage) is treated as "unset" and falls to the
  // 300 default — only a literal 0 means "no delay". This is why an empty/garbage save can never
  // pin 0 by accident.
  assert.equal(cleanConfig({ stepDelayMs: -10 }, FULL).stepDelayMs, 300, 'a negative pace is invalid → default')
  assert.equal(cleanConfig({ stepDelayMs: '' }, FULL).stepDelayMs, 300, 'an empty field → default')
})

test('a storage-only save keeps the top-level fields, and vice-versa', () => {
  const storageOnly = cleanConfig({ storage: { where: 'local' } }, FULL)
  assert.equal(storageOnly.stepDelayMs, 2000, 'top-level preserved through a storage save')
  assert.equal(storageOnly.storage.where, 'local', 'storage.where updated')
  assert.equal(storageOnly.storage.gitBranch, 'runs', 'the OTHER storage keys are preserved (one-level merge)')

  const topOnly = cleanConfig({ baseUrl: 'http://x' }, FULL)
  assert.equal(topOnly.storage.where, 'git', 'storage preserved through a top-level save')
})

test('with no current config, an omitted stepDelayMs falls to the 300 default', () => {
  assert.equal(cleanConfig({ baseUrl: 'http://x' }, {}).stepDelayMs, 300)
})

test('voiceOver is off by default, round-trips on, and survives a partial save', () => {
  // Default OFF — a project that never set it must read false, not undefined (init R6).
  assert.strictEqual(cleanConfig({}, {}).voiceOver, false, 'absent ⇒ off by default')
  // Turning it on persists; a real boolean, never a stray truthy string on disk.
  assert.strictEqual(cleanConfig({ voiceOver: true }, FULL).voiceOver, true, 'on persists')
  assert.strictEqual(cleanConfig({ voiceOver: 'yes' }, {}).voiceOver, true, 'coerced to a boolean')
  // The stepDelayMs bug, for voiceOver: a save that omits it must NOT reset it to the default.
  assert.strictEqual(
    cleanConfig({ baseUrl: 'http://x' }, { ...FULL, voiceOver: true }).voiceOver, true,
    'preserved through a partial save that never mentions it')
  // An explicit falsy in the payload turns it off (the switch can always be switched back).
  assert.strictEqual(
    cleanConfig({ voiceOver: false }, { ...FULL, voiceOver: true }).voiceOver, false,
    'an explicit false turns it off')
})
