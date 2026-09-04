// Reading spec/<screen>/ — the one place that decides what a screen IS and what state it is in.
//
// The builder and the server both need this. If either recomputed a hash its own way, an
// approval could be written against one value and compared against another, and staleness would
// be quietly wrong — which is the single failure this whole product cannot have.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregateCoverage, deriveReqState, deriveReqStatus, qualify } from './coverage.mjs'
import { foldEvidence, contentRect, legacyActualReplicas } from './evidence.mjs'
import { parseBehavior } from './behavior.mjs'
// pure: the beat-function metadata (GIVEN + BEATS) of a screen's steps.ts, read statically (Task 5)
import { parseBeats } from './compose.mjs'
import { reqHash, meaningText, isChanged } from './reqhash.mjs'
import { vizHash, vizStale } from './viz.mjs'
// the CI gate's PURE resolver — the same one .github/workflows/e2e.yml runs through
// `node tools/ci-select.mjs`, so the board's CI mark and the gate can never disagree
import { selectCiTests } from './ci-select.mjs'
import { appRoot } from './_skeleton.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Where the APP lives (2026-09-04, the sidecar layout): spec/_specboard.json's `app`, relative to
// ROOT, or ROOT itself when the board is vendored into the app repo. Nothing in the fold reads app
// code — proof is derived from spec/ alone — but the project's own helpers and the capabilities list
// (the app repo's .claude/ skills) need the way back. tools/_skeleton.mjs appRoot is the one rule.
export const APP_ROOT = appRoot(ROOT, (() => { try { return JSON.parse(readFileSync(join(ROOT, 'spec/_specboard.json'), 'utf8')) } catch { return null } })())
export const SPEC = join(ROOT, 'spec')

// Drafts are authored at this size and shown scaled, never re-laid-out.
export const CANVAS_W = 1280
export const CANVAS_H = 940

// Areas group the board so a project with eighty screens is still readable. Order is declared,
// not alphabetical, because the reading order of a product is a decision.
export const AREA_ORDER = ['Core', 'Gates', 'Running', 'Setup']

export const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 12)

// The screenshot cache-buster for board.html's ?h= param. A CONTENT hash, deliberately: hashing
// mtime meant every checkout/restore/touch churned board.html even with identical pixels (the
// restore-dance). Same bytes → same hash; a re-shot image still busts the cache. Missing file
// throws (ENOENT), same as always — readScreen guards with hasShot before calling.
export const shotHash = path => sha(readFileSync(path))

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

// The ONE job slot's close transition (dispatch R4/R5) — pure, so the rule is unit-testable
// (tools/job-slot.test.mjs) apart from the server that owns the mutable slot. A close releases
// the slot ONLY when the closing job is the current holder: a run TAKEN OVER (R4, cancel-and-run)
// closes a beat after its successor already claimed the slot, and popping unconditionally there
// freed — or handed to an ancestor, over the live takeover run — a slot that was not the closer's
// to release, so a second concurrent run could start: the exact thing the slot exists to refuse
// (Task 15 concern 4; reproduced live 2026-08-21). A non-holder's close only steps itself out of
// the ancestor chain (a parent that died in the stack must never be handed the slot back, dead).
// Pure: fresh arrays out, inputs untouched; jobs compare by identity, like the server's captured
// `myJob` locals. The `superseded` flag the takeover sets stays as the run's own record of WHY it
// was cancelled — the guard here is identity, which covers superseded and dead-ancestor alike.
export function slotAfterClose (closing, running, runStack) {
  if (closing && closing !== running) {
    return { running, runStack: runStack.filter(j => j !== closing) }
  }
  return {
    running: runStack.length ? runStack[runStack.length - 1] : null,
    runStack: runStack.slice(0, -1)
  }
}

// The deterministic composer vs the slot (final review m3). composeFlow is a synchronous WRITE of
// spec/<start>/test.spec.ts, not a job — it never takes the slot — but a write under a live run that
// is executing that file lands a fold whose ranAt predates the source (the run arrives stale, wasted),
// and a compose job on the same screen is a write race. Returns the live job that blocks the write —
// a test run of that screen or of the whole suite anywhere in the live chain (holder + stacked
// ancestors), or a compose job on that screen — or null. Pure (tools/job-slot.test.mjs); slot,
// cancel and nesting semantics are untouched, this only reads them.
export function composeBlockedBy (running, runStack, start) {
  for (const j of [...(runStack || []), running]) {
    if (!j) continue
    if (j.kind === 'tests' && (j.screen === 'all' || j.screen === start)) return j
    if (j.kind === 'compose' && j.screen === start) return j
  }
  return null
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
// FAMILIES (board R17, the human 2026-08-23): a `### <n> · <family> — <gloss>` line between
// sections opens a family that owns every requirement that follows it until the next `###`. It is
// NEVER part of a body — before this, a `###` line was absorbed into the previous requirement's
// body and moved its meaning hash (9 requirements read Changed on a pure re-grouping). A family
// carries no state: `families` is structure only — {n, name, gloss, heading, ids}, in prd order —
// and each requirement carries its family's `n` (null before the first heading, or with none).
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
  const families = []
  let family = null
  for (const chunk of body.split(/\n(?=##[#]? )/)) {
    const f = chunk.match(/^###\s+(.+)/)
    if (f) {
      const heading = f[1].trim()
      const m = heading.match(/^(?:(\S+)\s+·\s+)?(.*?)(?:\s+—\s+(.*))?$/)
      family = { n: m?.[1] ?? null, name: (m?.[2] ?? heading).trim(), gloss: (m?.[3] ?? '').trim(), heading, ids: [] }
      families.push(family)
      continue
    }
    const h = chunk.match(/^##\s+(.+)/)
    if (!h) continue
    const [, id, title] = h[1].match(/^(\S+)\s+—\s+(.*)$/) || [null, '', h[1]]
    reqs.push({ id, title, body: chunk.replace(/^##.*\n/, '').trim(), family: family ? family.n ?? family.name : null })
    if (family) family.ids.push(id)
  }
  return { fm, reqs, families }
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
  // anchored at line start (task-5 review B-4): a `test(` quoted in a string or a comment is not a
  // test — it once baked a phantom case the dispatch R8 sweep then failed on honestly
  const testRe = new RegExp(String.raw`^[ \t]*test\s*\(\s*` + QUOTED, 'gm')
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
export function foldByScreen (fresh, { partial = false, evidence = null } = {}) {
  const index = existsSync(RESULTS_INDEX) ? JSON.parse(readFileSync(RESULTS_INDEX, 'utf8')) : {}
  // The tree's CONTENT at this fold, pinned onto every entry this run writes — the second half of
  // staleness (passStale/runStale). Board-wide, not just this screen's, because coverage is
  // board-wide: a pass recorded on board's file can be staled by the requirement screen's own
  // steps.ts, and only a snapshot taken WITH the run can tell that edit from a fresh checkout.
  // Taken once per fold; each entry keeps the snapshot of its own run, beside its own ranAt.
  const srcHashes = sourceSnapshot()
  for (const [screen, r] of Object.entries(fresh)) {
    const prev = index[screen]
    // `provenHashes` (Changed-drift, board R4's fifth word) rides the screen's index entry and is
    // FOLDED like everything else here — a fresh report replaces the tests but must never clear the
    // pins of requirements it did not pass this run, so the previous pins carry over and
    // stampProvenHashes below re-stamps only what passed. `evidence` (Task 15) rides the entry the
    // same way: the harvest below re-folds only the requirements this run photographed.
    const pins = prev?.provenHashes
    const ev = prev?.evidence
    const carried = { ...(pins ? { provenHashes: pins } : {}), ...(ev ? { evidence: ev } : {}) }
    if (partial && prev && Array.isArray(prev.tests)) {
      const byTitle = new Map(prev.tests.map(t => [t.title, t]))
      for (const t of r.tests) byTitle.set(t.title, t)
      const tests = [...byTitle.values()]
      index[screen] = { total: tests.length, failed: tests.filter(t => !t.ok).length, tests, ranAt: r.ranAt, srcHashes, ...carried }
    } else index[screen] = { ...r, srcHashes, ...carried }
  }
  // Pin the proof text (Changed-drift): for every requirement this run's tests touched whose folded
  // status is now PASS, stamp a content hash of its wording at this moment. Compared at derive time
  // (enrichReqs) against the current text — a mismatch on a still-passing requirement reads Changed.
  stampProvenHashes(fresh, index)
  // Fold this run's harvested EVIDENCE (Task 15, D2 — the frame pair + its window, the raw
  // material any renderer of proof media needs; the Focus media pane renders it, and its
  // frame-stepper paces off the window — Task 13). Per requirement onto the requirement's screen,
  // fold-never-replace (tools/evidence.mjs, unit-tested); the superseded files it names — today
  // that includes a legacy entry's retired webp clip and Task 11 variants — are deleted so disk
  // stays bounded. Deletion is best-effort: a missing file is already what pruning wanted. (D1's
  // clip-carry oracle and per-entry text-hash pin retired WITH the clip, 2026-08-24: they existed
  // only to decide whether a video-less fold could keep it.)
  if (evidence && Object.keys(evidence).length) {
    for (const p of foldEvidence(index, evidence)) {
      try { rmSync(join(ROOT, p), { force: true }) } catch { /* already gone */ }
    }
    // …AND THE RETIRED HALF OF EVERY MOMENT (2026-09-04, one html per moment). A `.actual.html` is
    // named by no entry any more, so the keep-set above can never reach one: it would stay in the
    // tree for ever, be served, and be refused by `npm run proof mirror` as a replica nothing gated.
    // Swept per screen this fold touched — the same best-effort deletion, and the rule itself is
    // pure and unit-tested (tools/evidence.mjs legacyActualReplicas).
    for (const scr of new Set(Object.keys(evidence).map(q => (q.includes(':') ? q.slice(0, q.indexOf(':')) : '')).filter(Boolean))) {
      const dir = join(SPEC, scr, 'evidence')
      if (!existsSync(dir)) continue
      let names = []
      try { names = readdirSync(dir) } catch { names = [] }
      for (const n of legacyActualReplicas(names)) {
        try { rmSync(join(dir, n), { force: true }) } catch { /* already gone */ }
      }
    }
  }
  // drop screens whose directory is gone — a deleted screen should not haunt the column
  for (const screen of Object.keys(index)) if (!existsSync(join(SPEC, screen))) delete index[screen]
  // temp-then-rename: two runs can fold at once (a board-started run while the suite runs), and a
  // half-written index is worse than a stale one
  writeJson(RESULTS_INDEX, index)
  return index
}

// Stamp `provenHashes[reqId] = reqHash(meaningText(body))` for every requirement the FRESH run
// touched whose folded status is passed. Only this run's ids are touched — a requirement not
// passed this run keeps its previous pin (fold, never clear, the same rule as the rest of the
// index). A qualified cross-screen tag (`x:R3`) stamps under screen x, because the pin belongs to
// the REQUIREMENT's screen wherever the proving test's file lives. meaningText drops dated
// author-notes, so a provenance edit never flips Changed. A requirement no longer in its PRD
// (deleted, renamed) is simply not stamped.
function stampProvenHashes (fresh, index) {
  const touched = new Set()
  for (const r of Object.values(fresh)) {
    for (const t of r.tests || []) for (const id of Object.keys(t.reqs || {})) touched.add(id)
  }
  if (!touched.size) return
  // folded status is board-wide (a second screen's test can cover the same id), so derive it from
  // the whole just-folded index — the same fold enrichReqs reads, minus its source-staleness filter
  // (a pin stamped from a pass that later goes stale-by-source is harmless: staleness drops the
  // pass before status, so the requirement is not Passed and Changed cannot fire).
  const agg = aggregateCoverage(index)
  const prdCache = {}
  for (const qid of touched) {
    const i = qid.indexOf(':')
    if (i < 0) continue                       // ids in t.reqs are always qualified; stay safe anyway
    const scr = qid.slice(0, i)
    const rid = qid.slice(i + 1)
    if (deriveReqStatus(agg[qid] || []) !== 'passed') continue
    const body = reqBody(scr, rid, prdCache)
    if (body == null) continue
    // a cross-screen pin may land on a screen with no run entry yet — that pin-only entry carries
    // no tests, and readScreen treats it as "never run" (the run guard there), never a fake green
    const entry = (index[scr] ??= {})
    entry.provenHashes = { ...(entry.provenHashes || {}), [rid]: reqHash(meaningText(body)) }
  }
}

// A requirement's body text off its screen's prd.md, cached per screen for one fold — shared by the
// Changed-drift pin and the evidence pin so the two can never hash different text.
function reqBody (scr, rid, cache = {}) {
  const reqs = (cache[scr] ??= (() => {
    const p = join(SPEC, scr, 'prd.md')
    if (!existsSync(p)) return []
    try { return parsePrd(readFileSync(p, 'utf8')).reqs } catch { return [] }
  })())
  return reqs.find(r => r.id === rid)?.body ?? null
}

export const foldResults = (reportPath = RESULTS) => foldByScreen(parseReport(reportPath))

export function readResults () {
  if (existsSync(RESULTS_INDEX)) {
    try { return JSON.parse(readFileSync(RESULTS_INDEX, 'utf8')) } catch { /* fall through */ }
  }
  // before the first fold, the raw report is all there is
  return parseReport()
}

// The files whose CONTENT a screen's proof stands on. steps.ts carries beat assertions since
// Task 5 — editing one moves the proof's source like test.spec.ts.
export const SOURCE_FILES = ['prd.md', 'draft.html', 'test.spec.ts', 'steps.ts']

// Newest source file for a screen. If anything it proves has changed since the run, the result
// describes a version of this screen that no longer exists.
const newestSource = dir => SOURCE_FILES
  .map(f => join(dir, f))
  .filter(existsSync)
  .reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0)

// …and what that mtime is only a PROXY for: the sources' actual content. A clean checkout (CI, a
// fresh clone, a restore) stamps every file with checkout time, so mtime alone called every
// committed proof stale against a tree byte-identical to the fold that produced it — the whole
// board read untested on GitHub Actions while nothing had changed (run 33295483970: board R4's
// "some proven rows exist" precondition died and R12 derived a different next action). That is the
// honesty rule misfiring, not working. The fold records this fingerprint beside the run
// (foldByScreen → `srcHashes`), and staleness now needs BOTH: something newer than the run AND
// content that no longer matches what the run was made against.
export const sourceHash = dir => sha(SOURCE_FILES
  .map(f => {
    const p = join(dir, f)
    return `${f}:${existsSync(p) ? sha(readFileSync(p)) : '-'}`
  })
  .join('\n'))

// Every screen directory's fingerprint at this moment — what a fold pins onto the run. Keyed by
// directory name, so `_modes` (a spec directory with a test file but no prd) is included exactly
// like a screen: its test.spec.ts stales proofs the same way. A directory with none of the four
// source files is not a screen source and is skipped.
export function sourceSnapshot () {
  const out = {}
  for (const n of readdirSync(SPEC)) {
    const dir = join(SPEC, n)
    let st
    try { st = statSync(dir) } catch { continue }
    if (!st.isDirectory()) continue
    if (!SOURCE_FILES.some(f => existsSync(join(dir, f)))) continue
    out[n] = sourceHash(dir)
  }
  return out
}

// Per-requirement proof state (R4/R5). Every test's tags are aggregated across the WHOLE board — a
// flow on another screen can prove this screen's requirement, so a requirement lists every test that
// covers it wherever its FILE lives. A pass counts only while CURRENT: a pass that predates a change
// to the test/source that produced it describes a screen that no longer exists (the same honesty
// column 4 applies to a whole run), so it no longer proves anything. There is no acceptance gate
// (board R8), so nothing else invalidates a proof — state is simply proven / unproven. aggregateCoverage
// is memoised per results object, because allScreens hands every screen the same index and re-folding it
// once per screen would be wasteful on a large board.
//
// `status` (added alongside `state`, board R4 amended 2026-08-17) is the same fold read through
// deriveReqStatus — the four-word reader vocabulary (passed/failed/not-reached/untested, fail wins)
// the board now RENDERS. `state` stays exactly as it was: the walkthrough and the home "N / M proven"
// count still read it, and migrating those is a later task, not this one.
//
// `behavior` (added 2026-08-18, visual requirements; beats since 2026-08-20, D1) is the
// requirement's OWN body read through parseBehavior — the optional Given + 1..N When/Then beats
// block ({given, beats}) a requirement may lead with, or null when it is prose-only. Attached here
// (not in the builder) so every reader of a requirement sees the same parse; the builder only
// draws it. It is authored text re-shaped, never a derived state.
// `viz` (added 2026-08-22, requirement schematics — task 4) is the requirement's committed drawn
// schematic, read from spec/<screen>/viz/<id>.svg where one exists. The file is AUTHORED content
// (derived once from the behavior text by tools/viz.mjs, committed like code); what is COMPUTED
// here is only its honesty: the stamp the drawing carries (data-viz-hash) against the current
// behavior text's hash. A mismatch — the text moved past the drawing, or the behavior block was
// removed entirely — reads `stale`, and the board renders it quiet grey with the dated ≠ note,
// never a wrong picture passing for right. No viz file → null, exactly like behavior.
function vizFor (screen, id, behavior) {
  const p = join(SPEC, screen, 'viz', `${id}.svg`)
  if (!existsSync(p)) return null
  const svg = readFileSync(p, 'utf8').trim()
  const attr = n => (svg.match(new RegExp(`data-viz-${n}="([^"]*)"`)) || [])[1] || ''
  const hash = attr('hash')
  const textHash = vizHash(behavior)
  return {
    svg,
    hash,
    textHash,
    // task 4 review I1: one comparison authority — vizStale(hash, behavior) is the exact same
    // check (hash !== vizHash(behavior)) that viz.mjs already exports and unit-pins; this used to
    // recompute it inline as a second, un-pinned copy.
    stale: vizStale(hash, behavior),
    at: attr('at'),
    archetype: attr('archetype'),
    phases: attr('phases').split(/\s+/).filter(Boolean).map(Number)
  }
}

const _aggCache = new WeakMap()
function aggFor (results) {
  const key = results || {}
  let a = _aggCache.get(key)
  if (!a) { a = aggregateCoverage(key); _aggCache.set(key, a) }
  return a
}
// A pass counts only while CURRENT: stale if it predates a change to a source of EITHER the screen
// whose test file produced it OR the requirement's own screen (task-5 review B-3 — a cross-screen
// beat's assertion lives in the requirement's screen's steps.ts, e.g. dispatch:R7 proven from the
// board's file). "Changed" is content-aware since 2026-08-30 — see movedSince: mtime is the cheap
// gate, the fold's recorded fingerprint is the verdict, so a checkout stales nothing and a real
// edit still stales everything it touches. Pure (both the clock and the hash are injected);
// unit-tested in tools/stale-proof.test.mjs. Fails are never stale.
export function passStale (e, screen, srcMs, srcHash = () => undefined) {
  return e.status === 'pass' && e.ranAt != null &&
    (movedSince(e, e.screen, srcMs, srcHash) || movedSince(e, screen, srcMs, srcHash))
}
// Has screen `s`'s source moved since this record's run? TWO gates, and both must fire:
//   1. mtime — cheap, and the only thing that notices an edit made since the last fold (edit a
//      prd.md and the board must read unproven immediately, with no run in between)
//   2. the fingerprint the record pinned at run time — what tells a real edit from a checkout
// No pin for that screen on this record (a fold written before content-aware staleness, or a
// screen that did not exist at that fold) means there is no evidence about the content, and no
// evidence is not evidence of sameness: keep the old, conservative mtime answer (rule 3).
function movedSince (record, s, srcMs, srcHash) {
  if (!((srcMs(s) || 0) > record.ranAt)) return false
  const pinned = record.srcHashes?.[s]
  return pinned == null || srcHash(s) !== pinned
}
// The whole-RUN twin of passStale — readScreen's e2e cell (`ranstale`: "passed, then you edited").
// Same two gates against this screen's own source, so the column and the requirement rows can
// never disagree about whether the tree moved. Pure; unit-tested beside passStale.
export function runStale (run, screen, srcMs, srcHash = () => undefined) {
  return !!run && run.ranAt != null && movedSince(run, screen, srcMs, srcHash)
}
function enrichReqs (reqs, screen, results) {
  const agg = aggFor(results)
  const srcCache = {}
  const srcMs = s => (srcCache[s] ??= newestSource(join(SPEC, s)))
  const hashCache = {}
  const srcHash = s => (hashCache[s] ??= sourceHash(join(SPEC, s)))
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
      stale: passStale(e, screen, srcMs, srcHash)
    }))
    const hasCurrentPass = tests.some(t => t.status === 'pass' && !t.stale)
    // deriveReqStatus must see the SAME staleness filter hasCurrentPass does — a stale pass is
    // dropped before the fold, not just ignored by state, or a requirement whose only proof
    // predates a PRD/test edit would read Passed here while state correctly reads unproven (a real
    // green the code above exists to prevent, rule 3). Fail entries are never marked stale (`stale`
    // is defined only for status === 'pass'), so a current failure still wins regardless.
    const liveEntries = entries.filter((e, i) => !tests[i].stale)
    // Changed — board R4's fifth word (2026-08-19), a spec-store layer ON TOP of deriveReqStatus
    // (which stays the four proof words, like the staleness filter above): a requirement that is
    // Passed, has a `provenHashes` pin from its last passing fold, and whose CURRENT meaning text
    // no longer matches that pin, was proven against wording that has since moved — re-verify.
    // Computed here, never stored as a status; Failed / Not-reached / Untested keep their word
    // (isChanged is passed-only, pure, unit-tested in tools/reqhash.test.mjs).
    const folded = deriveReqStatus(liveEntries)
    const pin = results?.[screen]?.provenHashes?.[r.id]
    const status = isChanged(folded, pin, r.body) ? 'changed' : folded
    const behavior = parseBehavior(r.body)
    return { ...r, state: deriveReqState({ hasCurrentPass }), status, behavior, viz: vizFor(screen, r.id, behavior), tests }
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
  const { fm, reqs, families } = parsePrd(prdText)
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
  // The screen's COMPOSABLE BEATS (the beat-function convention, Task 5): spec/<screen>/steps.ts's
  // GIVEN + BEATS metadata, read the same static way the plans are — the composer's library derives
  // from this plus the behavior blocks and tests, never the crawl. No file → no given, no beats.
  const stepsPath = join(dir, 'steps.ts')
  const steps = existsSync(stepsPath) ? parseBeats(readFileSync(stepsPath, 'utf8')) : { given: null, beats: [] }
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
  // The run guard: a cross-screen Changed-drift pin can create an index entry that carries ONLY
  // `provenHashes` — no tests, no ranAt, because this screen itself has never run. Such an entry is
  // not a run, and treating it as one would walk `run.failed`/`run.ranAt` off undefined and read
  // the e2e cell green for a screen nothing ever tested (rule 3, never fake a green).
  const entry = allResults[name]
  const run = entry && Array.isArray(entry.tests) ? entry : undefined
  // "passed, then you edited" — the same two-gate rule the requirement rows use (runStale): newer
  // than the run AND different content from what the run was made against, so a fresh checkout
  // does not flip every screen's E2E cell to ranstale on a tree nothing has touched.
  const ranBeforeEdit = runStale(run, name, () => newestSource(dir), () => sourceHash(dir))
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

  // Optional: which source files this screen governs, as globs, so the staff briefing can answer
  // "what governs the file I am about to edit?" — the bridge from a route on the board to the code
  // that implements it. Comma- or space-separated in frontmatter.
  const governs = String(fm.governs || '').split(/[,\s]+/).map(g => g.trim()).filter(Boolean)

  return {
    name,
    area: fm.area || 'Other',
    title: fm.title || name,
    route: fm.route || '',
    governs,
    reqs: reqStates,
    // the prd's `###` families (board R17) — structure only, in prd order; [] when it has none
    families,
    prdText,
    rejections,
    hasShot,
    // cache-bust the img so a re-shot screenshot is never served stale from the last run
    shotHash: hasShot ? shotHash(join(dir, 'screen.png')) : '',
    run,
    plans,
    steps,
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
  // narrate a watchable run's recording ALOUD (piper voice + subtitles), not only burn its topbar.
  // OFF by default and saved per project (init R6); only bites a single watchable run of a screen
  // that has a narration pack (board R10) — otherwise the recording is silent, exactly as before.
  voiceOver: false,
  // a one-line tagline for the board's header crumb — `<package name> · <tagline>` (Task 8, the
  // frozen mockup's "Tsumiki · task-tracker demo"). Authored once, optional; blank = the name alone.
  tagline: '',
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
    // a real boolean on disk — a stale form or a truthy string can never pin a half-on state
    voiceOver: !!src.voiceOver,
    tagline: str(src.tagline, 120).trim(),
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

// Pure: should THIS run be voiced? Voice-over is deliberately narrow — a single WATCHABLE FLOW (one
// named test, `grep`, on a real screen) that HAS a narration pack, with the switch on and ffmpeg
// present to mux. "Run all" (no grep), a whole-suite run (no screen), a screen with no pack, or a
// box without ffmpeg all stay SILENT — the honest default (init R6, board R10 rule 3). Split out so
// the decision is unit-testable without a running board (tools/voiceover.test.mjs).
export function shouldVoice ({ voiceOver, screen, grep, packExists, ffmpeg } = {}) {
  return !!(voiceOver && screen && String(grep || '').trim() && packExists && ffmpeg)
}

// Where a screen's narration pack lives, if authored. Absent ⇒ that screen simply plays silent.
export const narrationPack = screen => join(SPEC, String(screen || ''), 'narration.json')

// The project's piper voice models live in a FIXED spec/_voices/ (so Setup's detection, the install
// helper, and the run all agree without an env var), unless BOARD_PIPER_VOICES points elsewhere.
export const voicesDir = () => process.env.BOARD_PIPER_VOICES || join(SPEC, '_voices')

// Pure: is this machine ready to VOICE a run? Setup disables the switch until every piece is present
// (init R6) — you cannot silently opt into something that can only stay silent. ffmpeg+ffprobe mux
// and measure; a synthesizer (piper on PATH, or a BOARD_SYNTH_CMD) speaks the lines; a voice model
// (*.onnx) is what it speaks with. Split from the live probe (serve-board) so the gate + its reason
// are unit-testable (tools/voiceover.test.mjs). Returns the same booleans back so the UI can be exact.
export function voiceReadiness ({ ffmpeg, ffprobe, synth, voiceModel } = {}) {
  const missing = []
  if (!ffmpeg || !ffprobe) missing.push('ffmpeg')
  if (!synth) missing.push('synth')
  if (!voiceModel) missing.push('voiceModel')
  const reason = missing.length === 0 ? ''
    : missing.includes('synth') ? 'piper not found — no synthesizer to speak the lines'
      : missing.includes('voiceModel') ? 'no voice model (*.onnx) in spec/_voices/'
        : 'ffmpeg not found'
  return {
    ready: missing.length === 0, missing, reason,
    ffmpeg: !!ffmpeg, ffprobe: !!ffprobe, synth: !!synth, voiceModel: !!voiceModel
  }
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
// touching settled ones (init R5), so this is the line between "still new" and "leave the human's
// work alone" — and it is drawn by the route's slug, not by list position, so the same route is the
// same screen across crawls.
export const routeExists = route => existsSync(join(SPEC, slugify(route), 'prd.md'))

export function readCrawl () {
  const raw = existsSync(CRAWL) ? JSON.parse(readFileSync(CRAWL, 'utf8')) : { crawledAt: null, routes: [] }
  const routes = (raw.routes || []).map(r => {
    const route = typeof r === 'string' ? r : r.route
    const slug = slugify(route)
    // a row already on the board keeps its own PRD — a crawl never overwrites it. There is no guess
    // distinction any more (the human, 2026-08-17): a screen with a PRD is the human's, full stop, and
    // is settled work the crawl must leave completely alone; a route with no PRD is still new.
    const exists = existsSync(join(SPEC, slug, 'prd.md'))
    return { ...(typeof r === 'string' ? {} : r), route, slug, exists }
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
  return sha([flat(f?.subject), ...[side(f?.a), side(f?.b)].sort()].join('\0'))
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

// ── A SCREEN WITH NO UI BORROWS A SIBLING'S CHROME (phase 7, 2026-09-04) ─────────────────────────
// A screen nobody has tested yet harvests nothing, so it has no replica and its Expected cell falls
// back to the archetype SKETCH. Standing on bare paper that sketch says nothing about WHOSE product
// it belongs to; standing inside a sibling screen's captured page — the app's own header and rail
// around it — it reads as this product's screen, not built yet. Two halves, kept apart on purpose:
// `chromeSource` is the disk read (which captured page a screen can lend), `chromeFrom` is the
// CHOICE, and the choice is pure so it can be pinned (tools/chrome-from.test.mjs).
//
// Only a screen with a committed BEFORE page can lend one: a before moment rang nothing, so its
// replica is the whole page — the chrome — rather than one component cropped out of it.
export function chromeSource (name) {
  const dir = join(SPEC, name, 'evidence')
  let files = []
  try { files = readdirSync(dir) } catch { return null }
  // deterministic: the first Before page by name that still has the skeleton it was measured with —
  // the skeleton is what says where the shell ends and a screen's own words begin
  for (const f of files.filter(n => n.endsWith('.before.expected.html')).sort()) {
    const layName = f.replace(/\.actual\.html$/, '.layout.json')
    if (!files.includes(layName)) continue
    let lay = null
    try { lay = JSON.parse(readFileSync(join(dir, layName), 'utf8')) } catch { continue }
    // …AND THE PAGE'S OWN BOTTOM EDGE (fix round 1, the review's I1): the replica records the height
    // of the DOCUMENT it was captured from, which on every real Before page is far taller than the
    // viewport the skeleton measured. Without it contentRect reads the fold as the page's end and
    // calls whatever crosses it a footer. Read from the file the chrome is rendered from, so the two
    // can never describe different pages.
    let doc = null
    try {
      const m = /data-replica-region="([^"]*)"/.exec(readFileSync(join(dir, f), 'utf8'))
      const p = m ? m[1].trim().split(/\s+/).map(Number) : []
      if (p.length === 4 && p.every(Number.isFinite)) doc = p[3]
    } catch { /* an unreadable page lends nothing but its viewport — contentRect's own fallback */ }
    const content = contentRect(lay, doc)
    if (!content) continue
    // (the layout PATH is deliberately not carried: nothing renders it — the shell is already read
    // into `content` here, at build time — and a field nobody reads is a field that goes stale. The
    // review's M1.)
    return {
      replica: `spec/${name}/evidence/${f}`,
      vw: Number(lay.w),
      vh: Number(lay.h),
      content
    }
  }
  return null
}
// Has this screen any captured markup of its own? A screen that has is never given someone else's
// chrome — it has its own picture, and two kinds of picture down one requirement is a comparison of
// nothing (the same rule the storyline's `hasReplicas` states on the client).
export function hasAnyReplica (name) {
  try { return readdirSync(join(SPEC, name, 'evidence')).some(f => f.endsWith('.expected.html')) } catch { return false }
}
// PURE. Same area first — a screen's siblings look like it — then the screen with the most
// requirements (the most-worked-on screen is the most representative page of the product), then by
// name so a tie can never render two different boards from one tree. `screens` are screen objects
// carrying the `chrome` chromeSource read for each; one with none cannot lend.
export function chromeFrom (screen, screens) {
  const name = screen && screen.name
  if (!name) return null
  const lenders = (screens || []).filter(s => s && s.name !== name && s.chrome && s.chrome.replica)
  if (!lenders.length) return null
  const sameArea = lenders.filter(s => s.area === (screen.area || 'Other'))
  const pool = sameArea.length ? sameArea : lenders
  const pick = pool.slice().sort((a, b) =>
    ((b.reqs || []).length - (a.reqs || []).length) || String(a.name).localeCompare(String(b.name)))[0]
  return pick ? { screen: pick.name, title: pick.title || pick.name, ...pick.chrome } : null
}

// THE CI GATE, DERIVED — never stored (the human, 2026-08-30: "user need to be clear that they can
// add tests for CI check, and what tests are added"). `spec/_ci.json` is the CHOOSER and
// tools/ci-select.mjs is the pure resolver the GitHub Actions workflow itself runs; this reads the
// same file through the SAME resolver, so a mark on the board can never disagree with the gate that
// actually runs. An absent or unparseable file means every screen, exactly as the resolver decides
// it — and a name in the chooser with no test.spec.ts on disk makes the resolver throw, which is a
// broken gate: the board says so rather than drawing a comforting "all screens" (rule 3).
export const CI_FILE = join(SPEC, '_ci.json')
export function ciGate () {
  const onDisk = readdirSync(SPEC)
    .filter(n => statSync(join(SPEC, n)).isDirectory() && existsSync(join(SPEC, n, 'test.spec.ts')))
  let config = null
  let parsed = false
  if (existsSync(CI_FILE)) {
    try { config = JSON.parse(readFileSync(CI_FILE, 'utf8')); parsed = true } catch { config = null }
  }
  try {
    return {
      all: config == null,          // no chooser (absent, or it would not parse) ⇒ every screen runs
      chosen: parsed && config != null,
      screens: selectCiTests(config, onDisk).map(p => p.split('/')[1]),
      error: ''
    }
  } catch (err) {
    return { all: false, chosen: true, screens: [], error: String(err.message || err) }
  }
}

export function sortedAreas (screens) {
  return [...new Set(screens.map(s => s.area))].sort((a, b) => {
    const ai = AREA_ORDER.indexOf(a); const bi = AREA_ORDER.indexOf(b)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b)
  })
}
