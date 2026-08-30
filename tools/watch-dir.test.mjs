// A WATCH THAT OUTLIVES THE DIRECTORY IT WATCHES.
//
// The first CI run of .github/workflows/e2e.yml (Linux, run 33294053726) died here: the _modes tests
// create and delete probe screen directories under spec/, and Node's recursive watcher walks the tree
// itself — so a watched subdirectory disappearing surfaces as an 'error' event on the FSWatcher
// (`ENOENT: no such file or directory, scandir 'spec/probe-changed-store'`). Nothing listened, an
// unhandled 'error' is a throw, and the whole board SERVER went down mid-suite; every remaining test
// then failed with ERR_CONNECTION_REFUSED. macOS fsevents never fires that event, which is why it
// only ever showed up on Linux.
//
// The watcher factory is injected so this proves the RE-ARM deterministically on any platform,
// rather than waiting for an OS to be kind enough to fail.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { watchDir } from './watch-dir.mjs'

// a stand-in FSWatcher: an emitter with close(), recording whether it was closed
function fakeWatcher () {
  const w = new EventEmitter()
  w.closed = false
  w.close = () => { w.closed = true }
  return w
}
// a fake fs.watch that records every call and hands back a fresh watcher
function factory () {
  const calls = []
  const made = []
  const fn = (dir, opts, cb) => {
    const w = fakeWatcher()
    calls.push({ dir, opts, cb })
    made.push(w)
    return w
  }
  fn.calls = calls
  fn.made = made
  return fn
}
// a synchronous timer, so a retry lands inside the test rather than on a real clock
function ticker () {
  const q = []
  const fn = (f) => { q.push(f); return { unref () {} } }
  fn.run = () => { const all = q.splice(0); for (const f of all) f() }
  fn.pending = () => q.length
  return fn
}

test('an FSWatcher error does not throw, and the watch is re-established', () => {
  const watch = factory()
  const later = ticker()
  const seen = []
  const h = watchDir('/spec', { recursive: true }, (e, name) => seen.push([e, name]), { watch, later })
  assert.equal(watch.calls.length, 1)
  assert.deepEqual(watch.calls[0].opts, { recursive: true })
  // the directory the walker was in disappears — Linux inotify's ENOENT scandir
  const err = Object.assign(new Error("ENOENT: no such file or directory, scandir 'spec/probe-changed-store'"), { code: 'ENOENT' })
  assert.doesNotThrow(() => watch.made[0].emit('error', err))
  assert.equal(watch.made[0].closed, true, 'the dead watcher is closed, never left leaking')
  // …and the watch comes back rather than silently ending
  later.run()
  assert.equal(watch.calls.length, 2, 're-armed on the same directory')
  assert.equal(watch.calls[1].dir, '/spec')
  // the feature still works after the lifecycle
  watch.made[1].cb ? null : null
  watch.calls[1].cb('change', 'todo/prd.md')
  assert.deepEqual(seen, [['change', 'todo/prd.md']])
  h.close()
})

test('a change delivered before any error still reaches the callback', () => {
  const watch = factory()
  const later = ticker()
  const seen = []
  watchDir('/spec', {}, (e, name) => seen.push(name), { watch, later })
  watch.calls[0].cb('rename', 'a.md')
  assert.deepEqual(seen, ['a.md'])
})

test('a callback that throws never kills the watch', () => {
  const watch = factory()
  const later = ticker()
  let n = 0
  watchDir('/spec', {}, () => { n++; throw new Error('rebuild blew up') }, { watch, later })
  assert.doesNotThrow(() => watch.calls[0].cb('change', 'x'))
  assert.doesNotThrow(() => watch.calls[0].cb('change', 'y'))
  assert.equal(n, 2, 'the watcher kept delivering')
})

test('a directory that is gone at arm time retries instead of throwing', () => {
  const calls = []
  let fail = 2
  const watch = (dir, opts, cb) => {
    calls.push(dir)
    if (fail-- > 0) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    const w = fakeWatcher(); w.cb = cb; watch.made = w; return w
  }
  const later = ticker()
  assert.doesNotThrow(() => watchDir('/gone', {}, () => {}, { watch, later }))
  assert.equal(calls.length, 1)
  later.run(); assert.equal(calls.length, 2)
  later.run(); assert.equal(calls.length, 3)
  later.run(); assert.equal(later.pending(), 0, 'a successful arm stops the retries')
})

test('close() ends the watch and stops it re-arming', () => {
  const watch = factory()
  const later = ticker()
  const h = watchDir('/spec', {}, () => {}, { watch, later })
  h.close()
  assert.equal(watch.made[0].closed, true)
  watch.made[0].emit('error', new Error('boom'))
  later.run()
  assert.equal(watch.calls.length, 1, 'a closed watch never comes back')
})

test('a watcher that errors forever gives up instead of spinning', () => {
  const watch = factory()
  const later = ticker()
  watchDir('/spec', {}, () => {}, { watch, later })
  for (let i = 0; i < 200; i++) {
    const w = watch.made[watch.made.length - 1]
    w.emit('error', new Error('gone'))
    later.run()
  }
  assert.ok(watch.calls.length <= 21, 'bounded re-arms, not an infinite loop: ' + watch.calls.length)
  assert.ok(watch.calls.length > 1, 'and it did try to come back')
})
