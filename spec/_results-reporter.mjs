import { foldByScreen } from '../tools/spec-store.mjs'

// Folds each run's results into spec/_results-index.json — the per-screen source of truth the
// board reads. It has to be a REPORTER, not a globalTeardown: Playwright writes the JSON report
// file AFTER teardown, so a teardown that read that file folded nothing. A reporter has the
// results in hand at onEnd and needs no file at all.
//
// The point of the index is that a report only covers the screens that RAN, so a scoped run of one
// screen must update that one and leave the rest standing — which is what foldByScreen does. Every
// run uses this reporter (it is in the config), so a board-started scoped run folds too.
export default class ResultsIndexReporter {
  onBegin (_config, suite) { this.suite = suite }

  onEnd () {
    if (!this.suite) return
    const byScreen = {}
    // a stable stamp for "when this run happened", so a pass can later be checked against what has
    // changed since — reporters run in a normal node process, so the clock is available here
    const ranAt = Date.now()
    for (const test of this.suite.allTests()) {
      const file = String(test.location?.file || '')
      const rel = file.split('/spec/')[1]
      if (!rel) continue
      const screen = rel.split('/')[0]
      const ok = test.outcome() === 'expected' || test.outcome() === 'flaky'
      const ms = Math.round((test.results || []).reduce((n, r) => n + (r.duration || 0), 0))
      const error = ok ? null
        : String((test.results || []).find(r => r.error)?.error?.message || '').slice(0, 400)
      const prev = byScreen[screen]
      byScreen[screen] = {
        total: (prev?.total || 0) + 1,
        failed: (prev?.failed || 0) + (ok ? 0 : 1),
        tests: [...(prev?.tests || []), { title: test.title, ok, ms, error, line: test.location?.line }],
        ranAt
      }
    }
    if (Object.keys(byScreen).length) {
      try { foldByScreen(byScreen) } catch (err) { console.error('results-index fold failed:', err) }
    }
  }
}
