// The auth-profile policy: given the target's default sign-in and any named profiles, produce the
// exact Playwright `projects`. Pinned here (node --test, no browser) because a wrong routing silently
// runs a screen under the wrong session — or twice — and that reads as a login flake, not a config bug.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthProjects, authStoragePath } from './auth-projects.mjs'

// authStoragePath -----------------------------------------------------------
test('the default profile keeps the historical state file; a named one gets its own', () => {
  assert.equal(authStoragePath(), './spec/_auth-state.json')
  assert.equal(authStoragePath('default'), './spec/_auth-state.json')
  assert.equal(authStoragePath('opcost'), './spec/_auth-opcost-state.json')
})

// no login ------------------------------------------------------------------
test('no signIn → null, so the caller runs the single default project unchanged', () => {
  assert.equal(buildAuthProjects(''), null)
  assert.equal(buildAuthProjects('   '), null)
  assert.equal(buildAuthProjects(undefined), null)
})

// single login (backward compatible) ----------------------------------------
test('signIn with no profiles → exactly the historical setup + screens pair', () => {
  const p = buildAuthProjects('LOGIN', [])
  assert.equal(p.length, 2)
  assert.equal(p[0].name, 'setup')
  assert.deepEqual(p[0].testMatch, /_auth\.setup\.ts$/)
  assert.equal(p[0].use.authScript, 'LOGIN')
  assert.equal(p[0].use.authStorage, './spec/_auth-state.json')
  assert.equal(p[0].use.launchOptions.slowMo, 0)
  assert.equal(p[1].name, 'screens')
  assert.equal(p[1].testMatch, '*/test.spec.ts')
  assert.equal(p[1].testIgnore, undefined) // nothing claimed → the default runs everything
  assert.deepEqual(p[1].dependencies, ['setup'])
  assert.equal(p[1].use.storageState, './spec/_auth-state.json')
})

// a named profile -----------------------------------------------------------
test('a named profile adds its own setup + screens and is excluded from the default', () => {
  const p = buildAuthProjects('LOGIN', [
    { name: 'opcost', signIn: 'OPCOST_LOGIN', match: ['property-operation-growth', 'houseview'] }
  ])
  assert.equal(p.length, 4)

  const screensDefault = p.find((x) => x.name === 'screens')
  // the default screens project now IGNORES the profiled dirs (so they never run twice)
  assert.ok(screensDefault.testIgnore instanceof RegExp)
  assert.ok(screensDefault.testIgnore.test('property-operation-growth/test.spec.ts'))
  assert.ok(screensDefault.testIgnore.test('spec/houseview/test.spec.ts'))
  assert.ok(!screensDefault.testIgnore.test('asset-plan/test.spec.ts'))

  const setupOpcost = p.find((x) => x.name === 'setup-opcost')
  assert.equal(setupOpcost.use.authScript, 'OPCOST_LOGIN')
  assert.equal(setupOpcost.use.authStorage, './spec/_auth-opcost-state.json')
  assert.equal(setupOpcost.use.launchOptions.slowMo, 0)

  const screensOpcost = p.find((x) => x.name === 'screens-opcost')
  assert.deepEqual(screensOpcost.dependencies, ['setup-opcost'])
  assert.equal(screensOpcost.use.storageState, './spec/_auth-opcost-state.json')
  // its testMatch routes ONLY its own dirs
  assert.ok(screensOpcost.testMatch.test('property-operation-growth/test.spec.ts'))
  assert.ok(screensOpcost.testMatch.test('houseview/test.spec.ts'))
  assert.ok(!screensOpcost.testMatch.test('asset-plan/test.spec.ts'))
})

// malformed profiles are ignored, not crashed -------------------------------
test('a profile missing a name, script, or match is dropped (never a half-wired project)', () => {
  const p = buildAuthProjects('LOGIN', [
    { name: '', signIn: 'X', match: ['a'] },
    { name: 'nofn', signIn: '  ', match: ['a'] },
    { name: 'nomatch', signIn: 'X', match: [] },
    { name: 'good', signIn: 'X', match: ['a'] }
  ])
  const names = p.map((x) => x.name)
  assert.deepEqual(names, ['setup', 'screens', 'setup-good', 'screens-good'])
})

// a regex-special dir name is escaped, not interpreted ----------------------
test('a dir name with regex metacharacters is matched literally', () => {
  const p = buildAuthProjects('LOGIN', [{ name: 'x', signIn: 'X', match: ['a.b+c'] }])
  const screensX = p.find((v) => v.name === 'screens-x')
  assert.ok(screensX.testMatch.test('a.b+c/test.spec.ts'))
  assert.ok(!screensX.testMatch.test('aXbbc/test.spec.ts')) // '.' and '+' are literal, not wildcards
})
