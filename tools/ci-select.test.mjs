// tools/ci-select.test.mjs — the CI gate is USER-CHOSEN, not "every screen automatically". This
// pure resolver turns spec/_ci.json's parsed contents (or null when the file is absent) plus the
// real set of screens on disk into the ordered list of test.spec.ts paths the gate should run. A
// typo in the chooser must fail LOUD — a name that silently drops out of the run is a gate that
// shrinks itself without telling anyone. No fs, no child_process (node --test): the CLI wrapper in
// ci-select.mjs owns reading the file and scanning the disk; this module only decides.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectCiTests } from './ci-select.mjs'

const DISK = ['board', 'conflicts', 'dispatch', 'init', '_modes']

test('absent config (null) selects every screen on disk, sorted for a stable order', () => {
  const paths = selectCiTests(null, DISK)
  assert.deepEqual(paths, [
    'spec/_modes/test.spec.ts',
    'spec/board/test.spec.ts',
    'spec/conflicts/test.spec.ts',
    'spec/dispatch/test.spec.ts',
    'spec/init/test.spec.ts'
  ])
})

test('a present config selects exactly the listed screens, in the order the human wrote them', () => {
  const paths = selectCiTests({ screens: ['init', 'board'] }, DISK)
  assert.deepEqual(paths, ['spec/init/test.spec.ts', 'spec/board/test.spec.ts'])
})

test('the seeded chooser excludes dispatch on purpose — the gate is a subset, not "all"', () => {
  const cfg = { screens: ['board', 'conflicts', 'init', '_modes'] }
  const paths = selectCiTests(cfg, DISK)
  assert.equal(paths.includes('spec/dispatch/test.spec.ts'), false)
  assert.deepEqual(paths, [
    'spec/board/test.spec.ts',
    'spec/conflicts/test.spec.ts',
    'spec/init/test.spec.ts',
    'spec/_modes/test.spec.ts'
  ])
})

test('a $comment key (or any other extra key) beside "screens" is ignored, not treated as a screen', () => {
  const cfg = { $comment: ['explains the file'], screens: ['board'] }
  const paths = selectCiTests(cfg, DISK)
  assert.deepEqual(paths, ['spec/board/test.spec.ts'])
})

test('a name with no test.spec.ts on disk errors loudly — a typo must not silently shrink the gate', () => {
  assert.throws(
    () => selectCiTests({ screens: ['baord'] }, DISK),
    /baord/
  )
})

test('one typo in a longer list still throws, naming the bad one, not just the count', () => {
  assert.throws(
    () => selectCiTests({ screens: ['board', 'nope', 'init'] }, DISK),
    /nope/
  )
})

test('an empty screens list is a valid (if empty) choice — the gate proves nothing, on purpose', () => {
  assert.deepEqual(selectCiTests({ screens: [] }, DISK), [])
})

test('a duplicate name in the list runs its spec file once, not twice', () => {
  const paths = selectCiTests({ screens: ['board', 'init', 'board'] }, DISK)
  assert.deepEqual(paths, ['spec/board/test.spec.ts', 'spec/init/test.spec.ts'])
})

test('an empty screens-on-disk list under an absent config selects nothing', () => {
  assert.deepEqual(selectCiTests(null, []), [])
})
