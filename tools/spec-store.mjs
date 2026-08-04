// Reading spec/<screen>/ — the one place that decides what a screen IS and what state it is in.
//
// The builder and the server both need this. If either recomputed a hash its own way, an
// approval could be written against one value and compared against another, and staleness would
// be quietly wrong — which is the single failure this whole product cannot have.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregateCoverage, deriveReqState, qualify } from './coverage.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SPEC = join(ROOT, 'spec')

// Drafts are authored at this size and shown scaled, never re-laid-out.
export const CANVAS_W = 1280
export const CANVAS_H = 940

// Areas group the board so a project with eighty screens is still readable. Order is declared,
// not alphabetical, because the reading order of a product is a decision.
export const AREA_ORDER = ['Core', 'Gates', 'Running', 'Setup']

export const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 12)

// Write, then rename. writeFileSync truncates and refills, so anything reading at that moment sees
// a half-written file — and every one of these files is read by another process while the server
// writes it (the board, the suite, a concurrent run). Rename is atomic within a filesystem, so a
// reader sees either the old file or the new one and never a torn one. A test caught this as
// "Unexpected end of JSON input"; the same race would corrupt a real approval.
export function writeJson (path, value) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  renameSync(tmp, path)
}
// Same temp-then-rename for text — a torn text file read mid-write would misparse (the prose
// equivalent of "Unexpected end of JSON input"). Used to write board.html atomically; kept general so
// anything textual this tool writes is observed either whole-old or whole-new, never half-formed.
export function writeText (path, text) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}
export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// The board's "run one" hands a test's TITLE to Playwright's -g, which is a REGEX. A title with a
// paren, bracket or dot — "… in-cell (before any Run)" — is then a pattern that does not match its
// own literal text, so the run finds no test and honestly reports zero cases while looking like it
// simply had nothing to do. Escaped, -g matches the title verbatim.
export const reEscape = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The verdict of a finished test run. A run that tested NOTHING is not a pass: "0 of 0 passing"
// reads green, but a run that matched no cases (a bad grep, a renamed test, Playwright's own "no
// tests found") proved nothing and must read as the error it is. So ok requires BOTH a clean exit
// AND at least one case actually run — never faking a green out of an empty run.
export function runVerdict (code, total) {
  return {
    ok: code === 0 && total > 0,
    note: total === 0 ? `no tests ran — the run matched no cases (exit ${code})` : null
  }
}

// Drafts link the shared sheet relatively so they render standalone over http. Embedded as
// srcdoc there is no base URL to resolve against, so it is inlined at build time instead.
// Exported because the BOARD uses it too. The board is one of the screens this tool tracks, so
// it has no business having a second design system — that is the drift this product exists to stop.
export const designCss = () => readFileSync(join(SPEC, '_design.css'), 'utf8')
export const inlineDesign = html =>
  html.replace(/<link[^>]+_design\.css[^>]*>/, `<style>${designCss()}</style>`)

// Frontmatter + `## R1 — title` blocks. Deliberately tiny: the PRD format is a decision we are
// still testing, and a parser with opinions is harder to change than one with none.
export function parsePrd (text) {
  const fm = {}
  let body = text
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (kv) fm[kv[1]] = kv[2].trim()
    }
    body = text.slice(m[0].length)
  }
  const reqs = []
  for (const chunk of body.split(/\n(?=## )/)) {
    const h = chunk.match(/^##\s+(.+)/)
    if (!h) continue
    const [, id, title] = h[1].match(/^(\S+)\s+—\s+(.*)$/) || [null, '', h[1]]
    reqs.push({ id, title, body: chunk.replace(/^##.*\n/, '').trim() })
  }
  return { fm, reqs }
}

// The board shows a test's steps read from its DEFINITION (board R10), so the full plan is visible
// the moment you open a test — before it has ever run, without trusting a green. This parses a
// spec file into the ordered plan per test: a `flowStep('…')` test plans its numbered story steps
// (a checkReq nested inside a flowStep is that step's detail, not a plan step of its own); a test
// with no flowStep plans one step per requirement it proves (`checkReq('R5')`), rendered by the
// requirement's title. Deliberately a light regex, not a parser — it runs at build time over the
// project's own spec files and degrades to an empty plan (the record-driven fallback) if it cannot
// read one, never throwing on an exotic file.
const QUOTED = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")`
export function parseTestPlan (src) {
  const s = String(src || '')
  // split into per-test blocks at each top-level test('…' / test("…"
  const testRe = new RegExp(String.raw`\btest\s*\(\s*` + QUOTED, 'g')
  const marks = []
  let m
  while ((m = testRe.exec(s))) marks.push({ title: unquote(m[1] ?? m[2]), at: m.index, bodyAt: testRe.lastIndex })
  const plans = []
  for (let i = 0; i < marks.length; i++) {
    const block = s.slice(marks[i].bodyAt, i + 1 < marks.length ? marks[i + 1].at : s.length)
    const flowRe = new RegExp(String.raw`\bflowStep\s*\(\s*` + QUOTED, 'g')
    const flows = []
    while ((m = flowRe.exec(block))) flows.push({ kind: 'flow', text: unquote(m[1] ?? m[2]) })
    // every requirement the block tags, in order (nested or not) — the row's coverage chips, so a
    // never-run test still shows what it will cover
    const reqRe = /\bcheckReq\s*\(\s*['"]([^'"]+)['"]/g
    const covers = []
    while ((m = reqRe.exec(block))) if (!covers.includes(m[1])) covers.push(m[1])
    const steps = flows.length ? flows : covers.map(id => ({ kind: 'prove', id }))
    plans.push({ title: marks[i].title, steps, covers })
  }
  return plans
}
const unquote = str => String(str || '').replace(/\\(['"\\])/g, '$1')

// Playwright writes one report for the whole run; the board needs it per screen. Tests live at
// spec/<screen>/test.spec.ts, so the directory IS the screen — no registry to keep in sync.
export const RESULTS = join(SPEC, '_results.json')
export const RESULTS_INDEX = join(SPEC, '_results-index.json')

// The board's "recent runs" log. Every run appends one capped entry — a board-started run from the
// server (rich, with per-test shots) and an external run (a plain `npm run e2e`, the crawl's own test
// run) from the reporter (a summary). Shared so both write the same shape to the same capped file,
// and neither a CLI run nor a crawl leaves the log empty the way it used to.
export const RUNS = join(SPEC, '_runs.json')
export const readRuns = () => existsSync(RUNS) ? JSON.parse(readFileSync(RUNS, 'utf8')) : []
export function recordRunEntry (entry, cap = 20) {
  const runs = [entry, ...readRuns()].slice(0, cap)
  writeJson(RUNS, runs)
  return runs
}

// Parse ONE Playwright JSON report into { screen: {total, failed, tests, ranAt} }. A report only
// covers the screens that actually ran, which is the whole trap: run one screen and the report
// mentions only that one.
export function parseReport (path = RESULTS) {
  if (!existsSync(path)) return {}
  let report
  try { report = JSON.parse(readFileSync(path, 'utf8')) } catch { return {} }
  // WHEN the run happened, so a pass can be checked against what has changed since. Columns 2
  // and 3 both go stale when their source moves; column 4 used to stay green forever, which made
  // it the one cell on the board allowed to be confidently out of date.
  const ranAt = statSync(path).mtimeMs
  const byScreen = {}
  const walk = suite => {
    for (const spec of suite.specs || []) {
      const screen = String(suite.file || spec.file || '').split('/')[0]
      if (!screen) continue
      const results = (spec.tests || []).flatMap(t => t.results || [])
      const ok = results.every(r => r.status === 'passed')
      const prev = byScreen[screen]
      byScreen[screen] = {
        total: (prev?.total || 0) + 1,
        failed: (prev?.failed || 0) + (ok ? 0 : 1),
        // the individual tests, so "7 of 7 passing" can be opened and read rather than trusted
        tests: [...(prev?.tests || []), {
          title: spec.title,
          ok,
          ms: Math.round(results.reduce((n, r) => n + (r.duration || 0), 0)),
          error: ok ? null : String(results.find(r => r.error)?.error?.message || '').slice(0, 400),
          line: spec.line
        }]
      }
    }
    for (const s of suite.suites || []) walk({ ...s, file: s.file || suite.file })
  }
  for (const s of report.suites || []) walk(s)
  for (const k of Object.keys(byScreen)) byScreen[k].ranAt = ranAt
  return byScreen
}

// The persistent per-screen results, folded ACROSS runs. A single report replaces the whole file,
// so a scoped run of one screen — which the board offers on every row, and which a test here also
// does — would erase every other screen's result and leave the E2E column lying that nothing was
// ever proven. The index keeps each screen's latest result and a report only overwrites the
// screens it actually contains. This is the source of truth the board reads.
// `partial` means the run was filtered to a subset (a -g on one test), so its report is NOT the
// whole truth about that screen: the tests it did not run still have perfectly good results from
// before. Replacing wholesale made "run this one test" report "1 of 1 passing" for a screen with
// five tests — the board understating its own coverage, which is the same species of lie as
// overstating it. A FULL screen run still replaces, because there the report is authoritative and
// a merge would keep a test that has since been deleted from the file.
export function foldByScreen (fresh, { partial = false } = {}) {
  const index = existsSync(RESULTS_INDEX) ? JSON.parse(readFileSync(RESULTS_INDEX, 'utf8')) : {}
  for (const [screen, r] of Object.entries(fresh)) {
    const prev = index[screen]
    if (partial && prev && Array.isArray(prev.tests)) {
      const byTitle = new Map(prev.tests.map(t => [t.title, t]))
      for (const t of r.tests) byTitle.set(t.title, t)
      const tests = [...byTitle.values()]
      index[screen] = { total: tests.length, failed: tests.filter(t => !t.ok).length, tests, ranAt: r.ranAt }
    } else index[screen] = r
  }
  // drop screens whose directory is gone — a deleted screen should not haunt the column
  for (const screen of Object.keys(index)) if (!existsSync(join(SPEC, screen))) delete index[screen]
  // temp-then-rename: two runs can fold at once (a board-started run while the suite runs), and a
  // half-written index is worse than a stale one
  writeJson(RESULTS_INDEX, index)
  return index
}

export const foldResults = (reportPath = RESULTS) => foldByScreen(parseReport(reportPath))

export function readResults () {
  if (existsSync(RESULTS_INDEX)) {
    try { return JSON.parse(readFileSync(RESULTS_INDEX, 'utf8')) } catch { /* fall through */ }
  }
  // before the first fold, the raw report is all there is
  return parseReport()
}

// Newest source file for a screen. If anything it proves has changed since the run, the result
// describes a version of this screen that no longer exists.
const newestSource = dir => ['prd.md', 'draft.html', 'test.spec.ts']
  .map(f => join(dir, f))
  .filter(existsSync)
  .reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0)

// Per-requirement proof state (R4/R5). Every test's tags are aggregated across the WHOLE board — a
// flow on another screen can prove this screen's requirement, so a requirement lists every test that
// covers it wherever its FILE lives. A pass counts only while CURRENT: a pass that predates a change
// to the test/source that produced it describes a screen that no longer exists (the same honesty
// column 4 applies to a whole run), so it no longer proves anything. There is no acceptance gate
// (board R8), so nothing else invalidates a proof — state is simply proven / unproven. aggregateCoverage
// is memoised per results object, because allScreens hands every screen the same index and re-folding it
// once per screen would be wasteful on a large board.
const _aggCache = new WeakMap()
function aggFor (results) {
  const key = results || {}
  let a = _aggCache.get(key)
  if (!a) { a = aggregateCoverage(key); _aggCache.set(key, a) }
  return a
}
function enrichReqs (reqs, screen, results) {
  const agg = aggFor(results)
  const srcCache = {}
  const srcMs = s => (srcCache[s] ??= newestSource(join(SPEC, s)))
  return reqs.map(r => {
    const entries = agg[qualify(r.id, screen)] || []
    const tests = entries.map(e => ({
      title: e.title,
      screen: e.screen,
      status: e.status,
      // A pass counts only while CURRENT: stale if it predates a change to a source of the screen
      // that produced it (prd.md / test.spec.ts) — the proof then describes a version that has moved.
      // Editing a requirement is exactly such a change: it touches prd.md, so that screen's proofs go
      // stale by source and the requirement reads unproven until re-run — no gate needed to notice.
      stale: e.status === 'pass' && e.ranAt != null && e.ranAt < srcMs(e.screen)
    }))
    const hasCurrentPass = tests.some(t => t.status === 'pass' && !t.stale)
    return { ...r, state: deriveReqState({ hasCurrentPass }), tests }
  })
}

export const statePath = name => join(SPEC, name, 'state.json')

export function readState (name) {
  const p = statePath(name)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
}

export function writeState (name, state) {
  writeJson(statePath(name), state)
}

export function readScreen (name, results = null) {
  const dir = join(SPEC, name)
  const prdPath = join(dir, 'prd.md')
  if (!existsSync(prdPath)) return null

  const prdText = readFileSync(prdPath, 'utf8')
  const { fm, reqs } = parsePrd(prdText)
  const prdHash = sha(prdText)

  const draftPath = join(dir, 'draft.html')
  const hasDraft = existsSync(draftPath)
  const draftSrc = hasDraft ? readFileSync(draftPath, 'utf8') : ''
  // Hash the file as authored, not as inlined — otherwise every draft goes stale whenever the
  // shared stylesheet is touched, and staleness stops meaning "this design changed".
  const draftHash = hasDraft ? sha(draftSrc) : null

  const hasShot = existsSync(join(dir, 'screen.png'))
  const hasTest = existsSync(join(dir, 'test.spec.ts'))
  // The plan of every test, read from the spec file itself, so the board shows a test's steps
  // before it has ever run (board R10). Empty when there is no test file or it parses to nothing.
  const plans = hasTest ? parseTestPlan(readFileSync(join(dir, 'test.spec.ts'), 'utf8')) : []
  const state = readState(name)

  // A cell WAITS when the thing to its left does not exist yet — there is nothing to be stale
  // against. REVIEW and STALE are deliberately not the same: review means nobody has ever said
  // yes to this, stale means they did and the thing it was approved against has since moved.
  // Collapsing them hides which of your gates is a first look and which is a re-look.
  // A rejection is a decision and has to LOOK different from never having looked — otherwise
  // saying no leaves the board identical to saying nothing, and the sentence you typed vanishes.
  // It only holds while the PRD is unchanged: rewrite the requirement and the question is new.
  const rejections = state.draftRejections || (state.draftRejection ? [state.draftRejection] : [])
  const lastRejection = rejections[rejections.length - 1]
  const rejected = lastRejection && lastRejection.againstPrd === prdHash

  // Two modes, decided per screen by whether a wireframe exists. DESIGN mode (has a draft) is the
  // greenfield loop: PRD → wireframe → build → test, with gate A on the draft and gate B on the
  // build. DOCUMENT mode (no draft) is for a screen that ALREADY exists — kg-init crawls it into a
  // PRD + the current screen + a test, and drawing a wireframe of a finished screen only to "build"
  // it would be circular. A no-draft screen only reads as document mode once it is POPULATED (a
  // screen or a test exists); a no-draft screen with neither is a greenfield screen nobody has
  // started yet, and it must read exactly as it always has — the invariant this split cannot break.
  const populated = hasShot || hasTest

  const draft = hasDraft
    ? (rejected ? 'rejected'
        : !state.draftApprovedAgainstPrd ? 'review'
          : state.draftApprovedAgainstPrd !== prdHash ? 'stale' : 'ok')
    // no wireframe: 'nodraft' is a non-blocking "existing screen, add one to redesign" — never a
    // gate. Only greenfield (nothing built yet) still reads 'missing', i.e. "draw one to start".
    : populated ? 'nodraft' : 'missing'

  const screen = hasDraft
    ? (!hasShot ? 'missing'
        : !state.screenApprovedAgainstDraft ? 'review'
          : state.screenApprovedAgainstDraft !== draftHash ? 'stale' : 'ok')
    // document mode has no gate B — there is no approved design to compare a build against, so the
    // screen is simply the current one, and its truth IS the passing test in column 4.
    : hasShot ? 'current' : 'waiting'

  // A test that exists but has never run proves nothing, so it is not a pass — it is "never run".
  const allResults = results || readResults()
  const run = allResults[name]
  const ranBeforeEdit = run && run.ranAt < newestSource(dir)
  // E2E is identical in both modes once a test exists; the only thing the draft ever gated here was
  // whether the screen had STARTED, and a document-mode screen has (it is a finished screen). So a
  // missing test reads 'missing' when there is something to test against (a draft, or a built
  // screen) and 'waiting' only on a bare greenfield screen with nothing yet.
  const e2e = !hasTest ? (hasDraft || populated ? 'missing' : 'waiting')
    : !run ? 'unrun'
      : run.failed ? 'fail'
        : ranBeforeEdit ? 'ranstale' : 'pass'

  // No acceptance gate (board R8): a requirement's state is proven / unproven from its tests alone
  // (R4), never a hash-diff against an "accepted" text. Editing the PRD IS the change — it stales the
  // proofs by source (enrichReqs) — so nothing is pinned or compared here.
  const reqStates = enrichReqs(reqs, name, allResults)

  // A crawled PRD is a GUESS read off the running page, never canon (init R3). It is a proposal
  // for the CEO to correct, so it must look different from a PRD a human wrote and it must not let
  // the loop skip gate A. The flag lives in frontmatter because it travels with the document — the
  // first time the CEO edits and means it, they delete the line, and the guess becomes theirs.
  const guess = /^(1|true|yes)$/i.test(String(fm.guess || ''))

  // Optional: which source files this screen governs, as globs, so the staff briefing can answer
  // "what governs the file I am about to edit?" — the bridge from a route on the board to the code
  // that implements it. Comma- or space-separated in frontmatter.
  const governs = String(fm.governs || '').split(/[,\s]+/).map(g => g.trim()).filter(Boolean)

  return {
    name,
    area: fm.area || 'Other',
    title: fm.title || name,
    route: fm.route || '',
    guess,
    governs,
    reqs: reqStates,
    prdText,
    rejections,
    hasShot,
    // cache-bust the img so a re-shot screenshot is never served stale from the last run
    shotHash: hasShot ? sha(String(statSync(join(dir, 'screen.png')).mtimeMs)) : '',
    run,
    plans,
    prdHash,
    draftHash,
    draftHtml: hasDraft ? inlineDesign(draftSrc) : '',
    state,
    cells: { prd: reqs.length ? 'ok' : 'missing', draft, screen, e2e }
  }
}

// config -------------------------------------------------------------------
// How to reach the project's own app so it can be crawled. The one thing the tool cannot derive
// from the tree — a wrong guess here builds a complete, confident, wrong board (init R1) — so it
// is asked once and kept.
export const CONFIG = join(SPEC, '_config.json')

// Two ways to reach an app, and the CEO asked for both. "attach" points at a dev server that is
// ALREADY running — starting a second one is how you end up crawling a stale copy on the wrong
// port. "start" runs the servers itself.
//
// A web app is often two servers, not one: an API and a frontend. If the crawl hits the frontend
// before the API is serving, it reads requirements off broken pages — a confident, wrong board,
// exactly what R1 warns of. So start mode runs the backend FIRST, waits for it to answer, and only
// then starts the frontend. baseUrl is always the FRONTEND — the thing that has routes to crawl;
// backendUrl is a readiness gate, never a crawl root.
export const DEFAULT_CONFIG = {
  mode: 'attach', baseUrl: '',
  backendCommand: '', backendUrl: '', frontendCommand: '',
  routes: [], signIn: '',
  // how long a watchable run pauses between actions, so a person can actually follow it
  stepDelayMs: 300,
  // where a run's screenshots and videos are kept. 'local' = spec/_runs/ in this repo (default).
  // 'git' = committed to a branch of this repo (pushed to origin only if push:true). A bucket = a
  // base URL uploads are PUT to.
  storage: { where: 'local', gitBranch: '', push: false, bucketUrl: '' }
}

export function readConfig () {
  if (!existsSync(CONFIG)) return { ...DEFAULT_CONFIG }
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG, 'utf8')) } }
  catch { return { ...DEFAULT_CONFIG } }
}

// Pure: merge an incoming (possibly PARTIAL) config OVER the current one, then clamp/clean every
// field. Split out of writeConfig so the load-bearing contract — "a partial save preserves the
// fields it doesn't mention" — is unit-testable without touching disk (tools/config.test.mjs).
//
// writeConfig used to rebuild the whole config from the incoming payload alone, so a partial save,
// or a save from a stale form, silently reset every unspecified field to its default (the reported
// "Pace of a watchable run keeps resetting to 300"). Here the incoming value wins where present and
// the current value fills every gap; `storage` is merged one level deep so a top-level-only save
// keeps the stored storage settings and vice-versa.
export function cleanConfig (cfg = {}, cur = {}) {
  const src = { ...cur, ...cfg, storage: { ...(cur.storage || {}), ...(cfg.storage || {}) } }
  const mode = src.mode === 'start' ? 'start' : 'attach'
  const str = (v, n = 400) => String(v || '').slice(0, n)
  return {
    mode,
    baseUrl: str(src.baseUrl).trim(),
    backendCommand: str(src.backendCommand),
    backendUrl: str(src.backendUrl).trim(),
    frontendCommand: str(src.frontendCommand),
    // one route per line or comma; blank means "crawl from the root"
    routes: (Array.isArray(src.routes) ? src.routes : String(src.routes || '').split(/[\n,]/))
      .map(r => String(r).trim()).filter(Boolean).slice(0, 200),
    signIn: str(src.signIn, 4000),
    // clamped: 0 means "as fast as it can", and a giant value would hang a watch forever
    stepDelayMs: Math.max(0, Math.min(5000, Number(src.stepDelayMs) || 0)) || (src.stepDelayMs === 0 ? 0 : 300),
    storage: {
      where: ['local', 'git', 'bucket'].includes(src.storage?.where) ? src.storage.where : 'local',
      gitBranch: str(src.storage?.gitBranch, 120).trim(),
      push: !!src.storage?.push,
      bucketUrl: str(src.storage?.bucketUrl, 400).trim()
    }
  }
}

export function writeConfig (cfg) {
  const clean = cleanConfig(cfg, readConfig())
  writeJson(CONFIG, clean)
  return clean
}

// A route becomes a directory name. '/product/:id' has to survive as something a filesystem and a
// URL hash both accept, and two different routes must never collapse to one folder.
export const slugify = route => {
  const s = String(route || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '').replace(/:/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').toLowerCase()
  return s || 'root'
}

// The crawl manifest — what the last crawl found, for the Init "what was found" table. Derived,
// overwritten each crawl, belongs to no screen.
export const CRAWL = join(SPEC, '_crawl.json')

// Whether a route already has a screen on the board. Rerunning must find NEW routes without
// touching settled ones (init R5), so this is the line between "create a guessed row" and "leave
// the CEO's work alone" — and it is drawn by the route's slug, not by list position, so the same
// route is the same screen across crawls.
export const routeExists = route => existsSync(join(SPEC, slugify(route), 'prd.md'))

export function readCrawl () {
  const raw = existsSync(CRAWL) ? JSON.parse(readFileSync(CRAWL, 'utf8')) : { crawledAt: null, routes: [] }
  const routes = (raw.routes || []).map(r => {
    const route = typeof r === 'string' ? r : r.route
    const slug = slugify(route)
    const exists = existsSync(join(SPEC, slug, 'prd.md'))
    // a row already on the board keeps its own PRD — a crawl never overwrites it, and if that PRD
    // is the CEO's (not a guess) it is settled work the crawl must leave completely alone
    const mine = exists && !readScreen(slug)?.guess
    return { ...(typeof r === 'string' ? {} : r), route, slug, exists, mine }
  })
  return { crawledAt: raw.crawledAt || null, ranAt: raw.crawledAt || null, routes }
}

// conflicts ----------------------------------------------------------------
// Two files, deliberately. The scanner OVERWRITES _conflicts.json wholesale on every run, so a
// decision stored inside it would be destroyed by the next scan. Decisions live apart and are
// matched back by content.
export const CONFLICTS = join(SPEC, '_conflicts.json')
export const DECISIONS = join(SPEC, '_conflict-decisions.json')

const flat = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// The identity of a contradiction is WHAT IT SAYS, never where it sat in a list. A rescan
// renumbers, reorders, renames ids and is free to emit the two sides the other way round — and
// under a positional or id-based key every one of those silently resurrects a question you had
// already settled, which is the exact failure R5 of the conflicts PRD names. Sorting the two
// sides before hashing is what makes an a/b swap the same conflict rather than a new one.
export const conflictKey = f => {
  const side = x => flat(x?.source) + '' + flat(x?.quote)
  return sha([flat(f?.subject), ...[side(f?.a), side(f?.b)].sort()].join(' '))
}

export const readDecisions = () =>
  existsSync(DECISIONS) ? JSON.parse(readFileSync(DECISIONS, 'utf8')) : {}

export const writeDecisions = d =>
  writeJson(DECISIONS, d)

// A finding is open or settled — there is no stored status, exactly as no cell on the board has
// one. Settled means a decision exists whose key matches this finding's content.
export function readConflicts () {
  let raw = null
  if (existsSync(CONFLICTS)) {
    try { raw = JSON.parse(readFileSync(CONFLICTS, 'utf8')) } catch { raw = null }
  }
  const decisions = readDecisions()
  const findings = (Array.isArray(raw?.findings) ? raw.findings : []).map(f => {
    const key = conflictKey(f)
    const decision = decisions[key] || null
    return { ...f, key, decision, status: decision ? 'settled' : 'open' }
  })
  return {
    // never scanned and scanned-and-found-nothing are different answers, and only one of them
    // means "there is nothing to worry about"
    scanned: !!raw,
    scannedAt: raw?.scannedAt || null,
    findings,
    open: findings.filter(f => f.status === 'open'),
    settled: findings.filter(f => f.status === 'settled')
  }
}

// Which file wins and which one has to be rewritten. The source is `spec/<screen>/prd.md · R<n>`;
// the rewrite targets the FILE, so the requirement suffix is dropped.
export const sideFile = side => String(side?.source || '').split('·')[0].trim()

export function allScreens () {
  // read the report ONCE for the whole board, not once per screen
  const results = readResults()
  return readdirSync(SPEC)
    .filter(n => !n.startsWith('_') && statSync(join(SPEC, n)).isDirectory())
    .map(n => readScreen(n, results))
    .filter(Boolean)
}

// "Waiting on you" is the ONE remaining human-correction case: a crawled GUESS the human has not yet
// confirmed (init R3). There is no acceptance gate (board R8) — editing the PRD IS the change, and a
// requirement's proven / unproven state is the tests' business, not a person's. A guess becomes canon
// when the human corrects it and deletes the `guess:` frontmatter flag; until then it waits.
export const isWaiting = s => !!s.guess

export function sortedAreas (screens) {
  return [...new Set(screens.map(s => s.area))].sort((a, b) => {
    const ai = AREA_ORDER.indexOf(a); const bi = AREA_ORDER.indexOf(b)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b)
  })
}
