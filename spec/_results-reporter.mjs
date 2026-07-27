import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { foldByScreen } from '../tools/spec-store.mjs'

// Folds each run's results into spec/_results-index.json — the per-screen source of truth the
// board reads. It has to be a REPORTER, not a globalTeardown: Playwright writes the JSON report
// file AFTER teardown, so a teardown that read that file folded nothing. A reporter has the
// results in hand at onEnd and needs no file at all.
//
// It also writes the RECORD manifest: which screenshots and video belong to which TEST. Keyed by
// title, so the board can show a test's own shots under that test row rather than a heap of images
// nobody can attribute. Playwright hands the reporter each test's attachments directly, so this is
// exact — no guessing from folder names.
export default class ResultsIndexReporter {
  onBegin (_config, suite) { this.suite = suite }

  onEnd () {
    if (!this.suite) return
    const byScreen = {}
    const shotsByTest = {}
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
      // the named steps INSIDE this test case (test.step(...)), so the board can show that a case
      // is one assertion or a small story — the thing that was confusing about R1 vs its steps
      const last = (test.results || []).slice(-1)[0]
      const steps = (last?.steps || []).filter(s => s.category === 'test.step').map(s => s.title)
      const prev = byScreen[screen]
      byScreen[screen] = {
        total: (prev?.total || 0) + 1,
        failed: (prev?.failed || 0) + (ok ? 0 : 1),
        tests: [...(prev?.tests || []), { title: test.title, ok, ms, error, line: test.location?.line, steps }],
        ranAt
      }
      // the images and video Playwright captured for THIS test, as repo-relative paths the static
      // server can load (the reporter runs with cwd = repo root)
      const atts = (test.results || []).flatMap(r => r.attachments || [])
      const shots = atts.filter(a => /\.png$/i.test(a.path || '')).map(a => relative(process.cwd(), a.path))
      const video = atts.find(a => /\.webm$/i.test(a.path || ''))
      if (shots.length || video) {
        shotsByTest[test.title] = { shots, video: video ? relative(process.cwd(), video.path) : null }
      }
    }
    if (Object.keys(byScreen).length) {
      // BOARD_PARTIAL is set by the server when it filtered the run to a subset — then this
      // report describes only the tests that ran, and the rest must keep their existing results.
      const partial = !!process.env.BOARD_PARTIAL
      try { foldByScreen(byScreen, { partial }) } catch (err) { console.error('results-index fold failed:', err) }
    }
    // The manifest lives in the run's own record directory, so it is pruned with the run it
    // describes and never outlives its images.
    if (process.env.BOARD_RECORD) {
      try { writeFileSync(join(process.env.BOARD_RECORD, 'shots.json'), JSON.stringify(shotsByTest)) }
      catch (err) { console.error('shots manifest write failed:', err) }
    }
  }
}
