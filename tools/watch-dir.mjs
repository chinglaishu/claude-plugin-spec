// ONE RESILIENT DIRECTORY WATCH.
//
// `fs.watch` hands back an EventEmitter, and an 'error' event with no listener is a THROW that takes
// the whole process with it. That is not theoretical: the first CI run of the e2e workflow (Linux,
// run 33294053726) killed the board server mid-suite with
//
//     Error: ENOENT: no such file or directory, scandir 'spec/probe-changed-store'
//
// — the _modes tests create and delete probe screen directories under spec/, Node's recursive
// watcher walks the tree itself on Linux, and a watched subdirectory disappearing under it surfaces
// as that error. Every test after it failed with ERR_CONNECTION_REFUSED against a server that was no
// longer there. macOS fsevents watches recursively in the kernel and never fires this, which is
// exactly why the trap survived until a Linux runner found it.
//
// So a watch here is: error-handled (never a throw), CLOSED when it dies (never a leak), and
// RE-ARMED on the same directory so the feature keeps working across a probe directory's whole
// lifecycle — bounded, so a directory that is genuinely gone stops rather than spinning. The
// callback is wrapped too: a rebuild that throws must not be the reason the board stops watching.
//
// `deps` exists so tools/watch-dir.test.mjs can prove the re-arm on any platform instead of waiting
// for an OS to fail politely.
import { watch as fsWatch } from 'node:fs'

const MAX_REARM = 20        // ~20 tries: a probe directory's churn is a handful, a dead path is not
const STEP_MS = 50          // linear backoff, capped — a watch is cheap, a hot loop is not
const CAP_MS = 1000

export function watchDir (dir, opts, onChange, deps = {}) {
  const watch = deps.watch || fsWatch
  const later = deps.later || ((fn, ms) => {
    const t = setTimeout(fn, ms)
    if (t && typeof t.unref === 'function') t.unref()
    return t
  })
  let w = null
  let closed = false
  let tries = 0

  const retry = () => {
    if (closed || tries >= MAX_REARM) return
    tries += 1
    later(arm, Math.min(CAP_MS, STEP_MS * tries))
  }
  const arm = () => {
    if (closed) return
    try {
      w = watch(dir, opts, (event, name) => {
        // a delivered event means the watch is healthy again — spend the budget on real failures
        tries = 0
        try { onChange(event, name) } catch { /* the board's own rebuild is never worth the watch */ }
      })
    } catch {
      // the directory itself is momentarily gone (a probe screen between rm and mkdir)
      w = null
      retry()
      return
    }
    if (w && typeof w.on === 'function') {
      w.on('error', () => {
        try { w.close() } catch { /* already dead */ }
        w = null
        retry()
      })
    }
  }
  arm()
  return {
    close () {
      closed = true
      try { if (w) w.close() } catch { /* already dead */ }
      w = null
    }
  }
}
