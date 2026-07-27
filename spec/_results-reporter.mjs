import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { foldByScreen } from '../tools/spec-store.mjs'

// Walk the step tree into a flat, ordered, indented list of the meaningful steps — the named
// steps a test author wrote (test.step), the actions Playwright took (pw:api, e.g. goto/click),
// and the assertions it made (expect). Hook and fixture noise is dropped. Capped so one test
// cannot bloat the record.
const STEP_NOISE = /^(Create (context|page|request context|browser context)|Launch browser|Close (context|page)|Fixture |Worker )/

// A Playwright step title reads like code — `Expect "toHaveCount" locator('.row')`. Turn it into a
// sentence a person can read. Generic, because this tool runs in other people's repos: it works
// off the matcher names and locator shapes, not any one project's selectors.
const MATCH = {
  toBeVisible: 'is visible', toBeHidden: 'is hidden', toBeAttached: 'is on the page',
  toHaveCount: 'has the expected number', toContainText: 'contains the expected text',
  toHaveText: 'reads the expected text', toHaveValue: 'has the expected value',
  toBeEnabled: 'is enabled', toBeDisabled: 'is disabled', toBeEditable: 'can be edited',
  toBeChecked: 'is ticked', toBeFocused: 'has focus', toHaveAttribute: 'has the expected attribute',
  toHaveClass: 'has the expected class', toHaveURL: 'is at the expected address',
  toBeGreaterThan: 'is more than expected', toBeGreaterThanOrEqual: 'is at least the expected',
  toBeLessThan: 'is fewer than expected', toBeLessThanOrEqual: 'is at most the expected',
  toBe: 'is what we expect', toEqual: 'equals what we expect', toMatch: 'matches the pattern',
  toHaveProperty: 'has the expected property', toBeTruthy: 'is set', toBeNull: 'is empty',
  toPass: 'eventually holds', toBeOK: 'succeeded'
}

function prettyTarget (loc) {
  let m
  if ((m = loc.match(/getByRole\((['"])(.*?)\1(?:.*?name:\s*(['"])(.*?)\3)?/))) {
    return 'the ' + m[2] + (m[4] ? ' “' + m[4] + '”' : '')
  }
  if ((m = loc.match(/getByText\((['"])(.*?)\1/))) return 'the text “' + m[2] + '”'
  if ((m = loc.match(/getBy(?:Label|Placeholder)\((['"])(.*?)\1/))) return 'the field “' + m[2] + '”'
  if ((m = loc.match(/getByTestId\((['"])(.*?)\1/))) return 'the “' + m[2] + '”'
  if ((m = loc.match(/locator\((['"])(.*?)\1\)/))) return 'the “' + m[2] + '”'
  return loc.replace(/\)\.(first|last|nth)\([^)]*\)/g, ')').slice(0, 70)
}

function humanize (cat, title) {
  if (cat === 'test.step') return title // the author's own words — already a sentence
  let m
  if (cat === 'expect') {
    if (!(m = title.match(/Expect "([^"]+)"\s*(.*)/))) return title
    const phrase = MATCH[m[1]] || ('passes ' + m[1])
    const tgt = m[2] ? prettyTarget(m[2]) : ''
    return tgt ? 'Check ' + tgt + ' ' + phrase : 'Check the result ' + phrase
  }
  if ((m = title.match(/^Navigate to "?([^"]*)"?/))) return 'Open ' + m[1]
  if (/^Reload/.test(title)) return 'Reload the page'
  if ((m = title.match(/^Go (back|forward)/))) return 'Go ' + m[1]
  if ((m = title.match(/^Double click (.+)/))) return 'Double-click ' + prettyTarget(m[1])
  if ((m = title.match(/^Click (.+)/))) return 'Click ' + prettyTarget(m[1])
  if ((m = title.match(/^(?:Fill|Type) (.+)/))) return 'Type into ' + prettyTarget(m[1])
  if ((m = title.match(/^Press (.+)/))) return 'Press ' + m[1]
  if ((m = title.match(/^Check (.+)/))) return 'Tick ' + prettyTarget(m[1])
  if ((m = title.match(/^Hover (.+)/))) return 'Hover over ' + prettyTarget(m[1])
  if (/^Wait for load state/.test(title)) return 'Wait for the page to load'
  if (/^Wait for navigation/.test(title)) return 'Wait for the page to change'
  if (/^Wait for (timeout|\d)/.test(title)) return 'Pause briefly'
  if ((m = title.match(/^Wait for (?:selector )?(.+)/))) return 'Wait for ' + prettyTarget(m[1])
  if ((m = title.match(/^Query count (.+)/))) return 'Count ' + prettyTarget(m[1])
  if ((m = title.match(/^Bounding box (.+)/))) return 'Measure where ' + prettyTarget(m[1]) + ' is'
  if ((m = title.match(/^Get attribute (.+)/))) return 'Read an attribute of ' + prettyTarget(m[1])
  if ((m = title.match(/^(GET|POST|PUT|DELETE|PATCH) "?([^"\s]*)"?/))) return m[1] + ' request to ' + m[2]
  if (/^Evaluate/.test(title)) return 'Run a script on the page'
  if (/^Screenshot/.test(title)) return 'Take a screenshot'
  if ((m = title.match(/^Wait for (.+)/))) return 'Wait for ' + m[1]
  return title
}

function flattenSteps (steps, depth = 0, out = []) {
  for (const s of steps || []) {
    if (out.length >= 80) break
    const title = String(s.title || '')
    // fixture/context setup is framework plumbing, not a step of the test
    const keep = ['test.step', 'pw:api', 'expect'].includes(s.category) && !STEP_NOISE.test(title)
    if (keep) out.push({ label: humanize(s.category, title).slice(0, 160), cat: s.category, depth, ok: !s.error })
    if (s.steps?.length) flattenSteps(s.steps, keep && s.category === 'test.step' ? depth + 1 : depth, out)
  }
  return out
}

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
      const prev = byScreen[screen]
      byScreen[screen] = {
        total: (prev?.total || 0) + 1,
        failed: (prev?.failed || 0) + (ok ? 0 : 1),
        tests: [...(prev?.tests || []), { title: test.title, ok, ms, error, line: test.location?.line }],
        ranAt
      }
      // the images and video Playwright captured for THIS test, as repo-relative paths the static
      // server can load (the reporter runs with cwd = repo root)
      const atts = (test.results || []).flatMap(r => r.attachments || [])
      const shots = atts.filter(a => /\.png$/i.test(a.path || '')).map(a => relative(process.cwd(), a.path))
      const video = atts.find(a => /\.webm$/i.test(a.path || ''))
      // The DETAIL STEPS of the case — every action and check Playwright ran, in order and nested,
      // so a test case can be expanded to see exactly what it did. Verbose, so it lives in the
      // per-run record (pruned with the run), never in the committed index.
      const steps = flattenSteps((test.results || []).slice(-1)[0]?.steps)
      if (shots.length || video || steps.length) {
        shotsByTest[test.title] = { shots, video: video ? relative(process.cwd(), video.path) : null, steps }
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
