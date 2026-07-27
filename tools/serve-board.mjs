// The board server: serves the board, records your gate decisions, and reloads when the spec
// changes on disk.
//
// The board is a generated static file, so without this it can only ever be looked at. Approving
// a draft has to write something, and the thing it writes is the pin that later makes the draft
// go stale. That write is the whole task-management feature.

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, watch, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join, normalize, extname } from 'node:path'
import {
  ROOT, SPEC, readScreen, readState, writeState, allScreens,
  CONFLICTS, readConflicts, readDecisions, writeDecisions, sideFile,
  CRAWL, readConfig, writeConfig, readCrawl, parseReport, writeJson
} from './spec-store.mjs'

const PORT = Number(process.env.PORT || 4173)

// The builder runs as a CHILD PROCESS, not an import. Node caches ES modules for the life of the
// process, so an imported build() keeps rendering with the code it was started with — and since
// the watcher rebuilds on every spec change, a long-running server will happily overwrite a
// freshly built board.html with output from the version you edited an hour ago. It looks exactly
// like your edit had no effect, which is the worst kind of bug to be handed.
const build = () =>
  execFileSync(process.execPath, [join(ROOT, 'tools/build-board.mjs')], { cwd: ROOT })
    .toString().trim()

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webm': 'video/webm'
}

const clients = new Set()
const push = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(payload)
}
const notify = () => push('change', 1)

// One run at a time, process-wide. Two Playwright runs against one server and one set of
// state.json files is the same race that made the suite flaky — refused, not queued, so you find
// out immediately instead of wondering why the results look interleaved.
let running = null
let watchOn = false

const RUNS = join(SPEC, '_runs.json')
const RUNDIR = join(SPEC, '_runs')
const readRuns = () => existsSync(RUNS) ? JSON.parse(readFileSync(RUNS, 'utf8')) : []

// The run's record, keyed by TEST so the board can show a test's own shots under that test — not
// a heap of images nobody can attribute. The reporter writes this manifest; here we only read it.
function collectRecord (dir) {
  const manifest = join(dir, 'shots.json')
  if (!existsSync(manifest)) return {}
  try { return JSON.parse(readFileSync(manifest, 'utf8')) } catch { return {} }
}

function recordRun (entry) {
  // A capped log, not a growing one. Twenty runs is enough to see a pattern and small enough that
  // nobody has to remember to prune it — and the artifacts of a run that falls off the end go with
  // it, or the record directory grows without limit.
  const runs = [entry, ...readRuns()].slice(0, 20)
  const keep = new Set(runs.map(r => r.runId).filter(Boolean))
  for (const name of (existsSync(RUNDIR) ? readdirSync(RUNDIR) : [])) {
    if (!keep.has(name)) rmSync(join(RUNDIR, name), { recursive: true, force: true })
  }
  writeJson(RUNS, runs)
}

// The redraft prompt is assembled HERE, from files, not from anything the browser sends. The only
// user text that reaches it is the rejection sentences you already typed and which are already on
// disk — so a page cannot smuggle instructions into an agent that has edit permission.
function redraftPrompt (s) {
  const houseStyle = allScreens()
    .find(x => x.name !== s.name && x.cells.draft === 'ok' && x.draftHtml)
  const why = (s.rejections || []).map((r, i) => `${i + 1}. ${r.why}`).join('\n')

  return [
    `Rewrite exactly one file: spec/${s.name}/draft.html`,
    'It is a hi-fi, clickable wireframe — fake data, no backend, but every control must actually work.',
    '',
    '## The requirements it has to satisfy',
    s.prdText,
    '',
    s.draftHtml ? `## The current draft (rewrite this)\n\n${s.draftHtml.slice(0, 12000)}` : '## There is no draft yet — create one.',
    '',
    why ? `## Why it was sent back — address EVERY point, including the earlier ones\n\n${why}` : '',
    '',
    '## House rules',
    '- Link the shared system with <link rel="stylesheet" href="../_design.css"> and use ONLY its tokens.',
    '  Never introduce a raw hex colour, a new font size, or a radius outside --r-sm/--r/--r-md/--r-lg.',
    '- Author at exactly 1280px wide. Keep the page under about 940px tall so it thumbnails whole.',
    '- No network requests of any kind. No external images or scripts.',
    '- Every button, toggle, field and tab must do something visible when clicked.',
    houseStyle ? `- Match the house style of spec/${houseStyle.name}/draft.html.` : '',
    '',
    'Write the file and stop. Do not touch any other file, do not run tests, do not explain.'
  ].filter(Boolean).join('\n')
}

// A generic agent job. Everything the board asks Claude to do is this shape: build a prompt from
// files on disk, run it, then check whether the thing that was supposed to change actually did.
// "The agent exited 0" is never taken as success.
function runJob ({ kind, label, prompt, changed, onDone, failNote }) {
  if (running) throw new Error('a job is already in progress')
  const started = Date.now()
  let transcript = ''

  // detached: the child gets its own process GROUP, so cancelling can kill the whole tree.
  // claude spawns helpers of its own; signalling the parent alone leaves them running, holding
  // the file open and finishing the edit you just asked it to abandon.
  const child = spawn('claude', ['-p', prompt, '--permission-mode', 'acceptEdits'],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })

  running = { screen: label, started, child, kind }
  push('run', { state: 'started', screen: label, kind })

  const feed = buf => {
    transcript += String(buf)
    for (const line of String(buf).split('\n')) {
      if (line.trim()) push('run', { state: 'line', line: line.replace(/\[[0-9;]*m/g, '').slice(0, 300) })
    }
  }
  child.stdout.on('data', feed)
  child.stderr.on('data', feed)
  child.on('error', err => push('run', { state: 'line', line: `could not start claude: ${err.message}` }))

  // "the file did not change" is true but useless when the real reason is that the agent never
  // got to run. Name the cause: an expired login is fixed in one command, and a silent no-op
  // sends you reading the prompt instead.
  const diagnose = () => {
    if (running && running.cancelled) return 'cancelled — whatever it had already written is left in place'
    if (/401|OAuth|authenticate/i.test(transcript)) return 'claude is not authenticated — run  claude  in a terminal and sign in, then retry'
    if (/command not found|ENOENT/i.test(transcript)) return 'the claude CLI is not on PATH'
    if (/permission/i.test(transcript)) return 'claude refused to write — check permissions'
    return failNote || 'nothing changed'
  }

  child.on('close', () => {
    // Ask the disk, never the exit code. An agent that exits 0 having done nothing is the most
    // common failure here, and reporting that as success is how you learn to stop trusting the panel.
    let ok = false
    try { ok = !!changed() } catch { ok = false }
    const note = ok ? (onDone ? onDone() : 'done') : diagnose()
    running = null
    try { build() } catch (err) { console.error(String(err.stderr || err)) }
    push('run', { state: 'done', kind, screen: label, ms: Date.now() - started, ok, total: 1, failed: ok ? 0 : 1, note })
    notify()
  })
}

// Killing the GROUP, not the process. Every job here spawns children of its own — claude has
// helpers, npx has playwright — and signalling only the leader leaves them running while the
// board reports the job stopped. Partial work is deliberately left on disk: seeing how far it
// got is the reason you cancelled rather than waited.
function cancelJob () {
  if (!running) throw new Error('nothing is running')
  const { child } = running
  running.cancelled = true
  push('run', { state: 'line', line: '— cancelled —' })
  try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch { /* already gone */ } }
  return running.screen
}

// The comparison surface is every PRD in the project. The model adjudicates a bounded set of real
// documents — it is never asked to go hunting the tree for something interesting.
function scanPrompt () {
  const docs = allScreens()
    .map(s => `### spec/${s.name}/prd.md\n\n${s.prdText}`).join('\n\n')
  return [
    'Find CONTRADICTIONS between these product requirement documents and write them to',
    'spec/_conflicts.json (overwrite it).',
    '',
    'A contradiction is ONE FACT STATED TWO INCOMPATIBLE WAYS — a count, a default, an ordering,',
    'a definition, a rule. Two requirements that cannot both be true at once.',
    'It is NOT: a gap, a TODO, a missing test, something merely unspecified, or two requirements',
    'that are simply about different things. If you are unsure, leave it out. A list with noise in',
    'it stops being opened, which is worse than a short list.',
    '',
    'Write exactly this JSON shape:',
    '{"scannedAt":"<ISO timestamp>","findings":[{',
    '  "id":"<short stable kebab-case slug of the subject>",',
    '  "subject":"<the one fact, as a short phrase>",',
    '  "a":{"source":"spec/<screen>/prd.md · R<n>","quote":"<the exact claim, one or two sentences>"},',
    '  "b":{"source":"spec/<screen>/prd.md · R<n>","quote":"<the exact claim, one or two sentences>"},',
    '  "impact":"<which screens go stale if this is resolved, one short phrase>"}]}',
    '',
    'If there are no genuine contradictions, write {"scannedAt":"...","findings":[]} — an empty',
    'list is a valid and useful answer.',
    '',
    docs,
    '',
    'Write only spec/_conflicts.json. Change nothing else. Do not explain.'
  ].join('\n')
}

function startScan () {
  // mtime, not bytes. A rescan that legitimately finds the same contradictions writes nearly the
  // same file, so comparing content would report a correct scan as a failure — but a file that
  // was never touched at all is the one case that actually means the agent did not do the job.
  const before = existsSync(CONFLICTS) ? statSync(CONFLICTS).mtimeMs : 0
  runJob({
    kind: 'scan',
    label: 'conflict scan',
    prompt: scanPrompt(),
    failNote: 'spec/_conflicts.json was not written',
    changed: () => {
      if (!existsSync(CONFLICTS) || statSync(CONFLICTS).mtimeMs === before) return false
      // must parse, and must actually carry a findings list — half-written JSON is not a result
      return Array.isArray(JSON.parse(readFileSync(CONFLICTS, 'utf8')).findings)
    },
    onDone: () => {
      const { open, settled } = readConflicts()
      return `${open.length} open contradiction${open.length === 1 ? '' : 's'}` +
        (settled.length ? ` · ${settled.length} already settled, kept by content` : '')
    }
  })
}

function startDispatch (screenName) {
  const s = readScreen(screenName)
  if (!s) throw new Error(`no such screen: ${screenName}`)
  runJob({
    kind: 'redraft',
    label: screenName,
    prompt: redraftPrompt(s),
    failNote: 'the draft did not change',
    changed: () => {
      const after = readScreen(screenName)
      return after && after.draftHash !== s.draftHash
    },
    onDone: () => {
      const st = readState(screenName)
      // a fresh draft answers the old objections — the gate reopens on its own merits
      delete st.draftRejections
      delete st.draftRejection
      delete st.draftApprovedAgainstPrd
      writeState(screenName, st)
      return 'draft rewritten — gate A is open again'
    }
  })
}

// Rewriting the losing PRD so both documents finally agree. This is the half of a resolution that
// costs minutes, and it is deliberately a SEPARATE step from recording the decision: the decision
// is yours and must be durable the instant you make it, while the rewrite is mechanical, slow,
// and safe to retry. Failing to rewrite must never lose the answer you gave.
function rewritePrompt (finding) {
  const won = finding.decision.canon === 'a' ? finding.a : finding.b
  const lost = finding.decision.canon === 'a' ? finding.b : finding.a
  const note = String(finding.decision.note || '').trim()
  return [
    `Rewrite exactly one file: ${sideFile(lost)}`,
    '',
    'Two requirement documents contradict each other. The CEO has chosen which one is canon.',
    `The subject is: ${finding.subject}`,
    '',
    `## Canon — do NOT change this, it is the answer (${won.source})`,
    won.quote,
    '',
    `## Wrong — this is the claim you must remove (${lost.source})`,
    lost.quote,
    '',
    note ? `## The CEO's note on the decision\n\n${note}\n` : '',
    `Edit ${sideFile(lost)} so it agrees with the canon above. Change ONLY the sentences that`,
    'state the losing claim. Keep the frontmatter, keep every requirement id, keep the voice and',
    'the formatting of the surrounding document, and do not add, delete or renumber requirements.',
    '',
    'Write that one file and stop. Do not touch any other file, do not run tests, do not explain.'
  ].filter(Boolean).join('\n')
}

function startRewrite (key) {
  const finding = readConflicts().findings.find(f => f.key === key)
  if (!finding) throw new Error('no such conflict')
  if (!finding.decision) throw new Error('that conflict has not been settled yet')
  const file = join(ROOT, sideFile(finding.decision.lost))
  if (!existsSync(file)) throw new Error(`cannot rewrite ${finding.decision.lost} — no such file`)
  const before = readFileSync(file, 'utf8')

  runJob({
    kind: 'rewrite',
    label: finding.decision.lost,
    prompt: rewritePrompt(finding),
    failNote: `${finding.decision.lost} did not change`,
    changed: () => readFileSync(file, 'utf8') !== before,
    // No pins are cleared here on purpose. The PRD hash moved, so every gate downstream of it
    // reopens by itself through the ordinary staleness rule — the same rule that governs an edit
    // you make by hand. A resolution is not a special kind of edit.
    onDone: () => `${finding.decision.lost} now agrees — its screens have gone stale`
  })
}

// The crawl: visit the project's own app, screenshot each route, then draft a guessed PRD per NEW
// route. It is a real browser plus a Claude job, so like the redraft it lives OUTSIDE the
// deterministic suite. Two phases in one job: tools/crawl.mjs drives the browser and writes the
// manifest + crawl.png; then Claude drafts a guessed prd.md for every route not already on the
// board. Rerunning touches nothing settled — the crawler writes the manifest, the drafting skips
// any route whose screen already exists.
function crawlDraftPrompt (routes) {
  const targets = routes.filter(r => !r.exists)
  const list = targets.map(r =>
    `- route ${r.route} → spec/${r.slug}/prd.md` +
    (r.title ? ` (page title: ${r.title})` : '') +
    (r.headings ? `\n  headings on the page: ${r.headings}` : '')).join('\n')
  return [
    'A crawl visited this project\'s running app and captured each route. For every route below,',
    'write a GUESSED product requirement document at the given path, reading the requirements off',
    'what the page appears to do. Each file must start with this frontmatter, guess included:',
    '',
    '---',
    'screen: <slug>',
    'area: Crawled',
    'title: <a short human name for the screen>',
    'route: <the route>',
    'guess: true',
    '---',
    '',
    'Then `## R1 — <title>` blocks, one per behaviour you can infer from the page. The `guess: true`',
    'line is not optional: this is a proposal for the CEO to correct, never canon. Do not remove it,',
    'and do not approve anything.',
    '',
    'The screenshot for each route is at spec/<slug>/crawl.png if you need to look.',
    '',
    'Routes to draft (skip any file that already exists — its screen is already on the board):',
    list,
    '',
    'Write only those prd.md files. Change nothing else. Do not explain.'
  ].join('\n')
}

function startCrawl () {
  if (running) throw new Error('a job is already in progress')
  const cfg = readConfig()
  if (!cfg.baseUrl && cfg.mode === 'attach') throw new Error('set the app URL first — nothing to crawl')

  const started = Date.now()
  let transcript = ''
  // Phase one is the browser. It is detached so Cancel can reach chromium and any app it started.
  const crawler = spawn(process.execPath, [join(ROOT, 'tools/crawl.mjs')],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })
  running = { screen: 'crawl', started, child: crawler, kind: 'crawl' }
  push('run', { state: 'started', screen: 'crawl', kind: 'crawl' })

  const feed = buf => {
    transcript += String(buf)
    for (const line of String(buf).split('\n'))
      if (line.trim()) push('run', { state: 'line', line: line.replace(/\[[0-9;]*m/g, '').slice(0, 300) })
  }
  crawler.stdout.on('data', feed)
  crawler.stderr.on('data', feed)
  crawler.on('error', err => push('run', { state: 'line', line: `could not start the crawler: ${err.message}` }))

  crawler.on('close', () => {
    if (running && running.cancelled) { finishCrawl(started, false, 'cancelled — partial crawl left in place'); return }
    const manifest = readCrawl()
    if (!manifest.routes.length) {
      // greenfield: nothing to draft, and that is a valid, complete answer
      finishCrawl(started, true, 'nothing found — greenfield: write the first PRD')
      return
    }
    const toDraft = manifest.routes.filter(r => !r.exists)
    if (!toDraft.length) { finishCrawl(started, true, `${manifest.routes.length} route(s), all already on the board`); return }

    // Phase two: Claude drafts a guessed PRD per new route. The browser is done; hand the same
    // job's panel to the drafter so it reads as one continuous crawl.
    push('run', { state: 'line', line: `drafting ${toDraft.length} guessed PRD(s)…` })
    const before = new Set(allScreens().map(s => s.name))
    const drafter = spawn('claude', ['-p', crawlDraftPrompt(manifest.routes), '--permission-mode', 'acceptEdits'],
      { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })
    running.child = drafter
    drafter.stdout.on('data', feed)
    drafter.stderr.on('data', feed)
    drafter.on('error', err => push('run', { state: 'line', line: `could not start claude: ${err.message}` }))
    drafter.on('close', () => {
      const added = allScreens().filter(s => !before.has(s.name)).length
      const note = added
        ? `crawled ${manifest.routes.length} route(s) · ${added} new guessed row(s) — correct them at gate A`
        : (running && running.cancelled ? 'cancelled — partial crawl left in place'
          : /401|OAuth|authenticate/i.test(transcript) ? 'crawled, but claude is not authenticated — sign in and rerun to draft'
            : 'crawled, but no rows were drafted')
      finishCrawl(started, added > 0, note)
    })
  })
}

function finishCrawl (started, ok, note) {
  running = null
  try { build() } catch (err) { console.error(String(err.stderr || err)) }
  push('run', { state: 'done', kind: 'crawl', screen: 'crawl', ms: Date.now() - started, ok, total: 1, failed: ok ? 0 : 1, note })
  notify()
}

// Recording the decision. Keyed by content so a rescan cannot resurrect it, and it stores the
// two sides it was made about — a decision you cannot read back is not a record of anything.
function decideConflict ({ key, canon, note, undo }) {
  const finding = readConflicts().findings.find(f => f.key === key)
  if (!finding) throw new Error('no such conflict')
  const decisions = readDecisions()

  if (undo) {
    delete decisions[key]
    writeDecisions(decisions)
    build()
    return { ok: true, status: 'open' }
  }
  if (canon !== 'a' && canon !== 'b') throw new Error('pick a side: canon must be "a" or "b"')

  const won = canon === 'a' ? finding.a : finding.b
  const lost = canon === 'a' ? finding.b : finding.a
  decisions[key] = {
    canon,
    subject: finding.subject,
    won: sideFile(won),
    lost: sideFile(lost),
    note: String(note || '').slice(0, 500),
    at: new Date().toISOString()
  }
  writeDecisions(decisions)
  build()
  return { ok: true, status: 'settled', decision: decisions[key] }
}

function startRun (screen, opts = {}) {
  if (running) throw new Error('a run is already in progress')
  const args = ['playwright', 'test', '--config=playwright.board.ts']
  // the only interpolated value, and it is checked against real directories before it is used
  if (screen) args.push(join('spec', screen, 'test.spec.ts'))
  // ONE test, not the whole file. Passed as its own argv entry, never interpolated into a shell
  // string, so a title with quotes or spaces in it cannot become anything but a grep pattern.
  const grep = String(opts.grep || '').trim()
  if (grep) args.push('-g', grep)
  // Headed: the browser opens and you watch the test drive the app. This is what "watch it run"
  // means to a person — the file-watcher that re-runs on save is a different feature entirely.
  if (opts.headed) args.push('--headed')
  // A headed run is paced so you can follow it — the delay comes from Setup, not a magic number.
  const slowMo = opts.headed ? readConfig().stepDelayMs : 0

  const started = Date.now()
  // A run started BY the board writes to its OWN report file. Scoped to one screen it would
  // otherwise overwrite spec/_results.json — the file a concurrent full run (or the suite itself)
  // is also writing — and erase every other screen's result. It folds into the per-screen index
  // on close instead, so a one-screen run updates one screen and leaves the rest standing.
  const report = join(SPEC, '_run-report.json')
  // The RECORD of this run: every screenshot and video Playwright captures while it drives the
  // app, kept per run so "what did the test actually see" is answerable afterwards rather than
  // only while you happened to be watching. Lives under spec/ because that is the only tree the
  // static server will serve.
  const runId = String(started)
  const recordDir = join(RUNDIR, runId)
  mkdirSync(recordDir, { recursive: true })
  // detached for the same reason the agent jobs are: npx is a launcher, playwright is the thing
  // actually running, and cancelling has to reach the browser it started.
  const child = spawn('npx', args, {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      BOARD_RESULTS: report,
      BOARD_RECORD: recordDir,
      ...(slowMo ? { BOARD_SLOWMO: String(slowMo) } : {}),
      // watching means ONE window that runs through every case — not a window flashing open and
      // shut between them
      ...(opts.headed ? { BOARD_ONE_WINDOW: '1' } : {}),
      // a filtered run reports on a subset, so the index must merge rather than replace
      ...(grep ? { BOARD_PARTIAL: '1' } : {})
    }
  })
  running = { screen: screen || 'all', started, child, kind: 'tests', runId }
  push('run', { state: 'started', screen: running.screen })

  const feed = buf => {
    for (const line of String(buf).split('\n')) {
      if (line.trim()) push('run', { state: 'line', line: line.replace(/\[[0-9;]*m/g, '').slice(0, 300) })
    }
  }
  child.stdout.on('data', feed)
  child.stderr.on('data', feed)

  child.on('close', code => {
    // the run's own reporter has already folded its results into the per-screen index by now; here
    // we only need this run's totals for the run-log, read from the report it wrote
    let fresh = {}
    try { fresh = parseReport(report) } catch { /* no report — the run never produced one */ }
    const totals = Object.values(fresh).reduce(
      (a, r) => ({ total: a.total + r.total, failed: a.failed + r.failed }), { total: 0, failed: 0 })
    const entry = {
      at: new Date(started).toISOString(),
      screen: running.screen,
      ms: Date.now() - started,
      ...totals,
      ok: code === 0,
      runId,
      // what each test SAW, keyed by title — the record is only useful if it can be looked at,
      // and only trustworthy if you can tell which test it belongs to
      shotsByTest: collectRecord(recordDir)
    }
    recordRun(entry)
    running = null
    try { build() } catch (err) { console.error(String(err.stderr || err)) }
    push('run', { state: 'done', ...entry })
    notify()
  })
}

function readBody (req) {
  return new Promise((ok, bad) => {
    let s = ''
    req.on('data', c => { s += c; if (s.length > 1e6) { bad(new Error('too large')); req.destroy() } })
    req.on('end', () => ok(s))
  })
}

// Approving pins the hash of what you approved it AGAINST — not a timestamp, not a boolean.
// A timestamp cannot tell you whether the thing changed, only that time passed.
function applyGate ({ screen, gate, act, why }) {
  const s = readScreen(screen)
  if (!s) throw new Error(`no such screen: ${screen}`)
  const state = readState(screen)

  if (gate === 'draft') {
    if (act === 'approve') {
      state.draftApprovedAgainstPrd = s.prdHash
      // The text, not only the hash — this is what the next gate diffs against.
      state.approvedPrdText = s.prdText
      // Approving settles the argument, so the history stops being open feedback. It is kept
      // rather than deleted: what you objected to is the record of why this draft looks like this.
      if (state.draftRejections) state.draftResolvedRejections = state.draftRejections
      delete state.draftRejections
      delete state.draftRejection
    } else if (act === 'unapprove') {
      delete state.draftApprovedAgainstPrd
      delete state.approvedPrdText
    }
    else if (act === 'unreject') {
      // Undo one round, not the whole history — and leave no empty husk behind.
      const left = (state.draftRejections || []).slice(0, -1)
      if (left.length) state.draftRejections = left; else delete state.draftRejections
      delete state.draftRejection
    }
    else if (act === 'reject') {
      // A rejection without a reason is worse than no rejection: it clears the approval, puts the
      // screen in a state only a redraft can leave, and says nothing about what to change. The
      // gate A design already refuses this; the API has to refuse it too, or the rule only holds
      // for people who happen to come through the UI.
      if (!String(why || '').trim()) throw new Error('a rejection needs a reason')
      delete state.draftApprovedAgainstPrd
      // A LIST, not one object. Rejecting twice used to destroy the first sentence, so a redraft
      // would only ever see your latest complaint and was free to re-introduce the thing you
      // rejected two rounds ago. Every round of feedback has to survive into the next attempt.
      state.draftRejections = [
        ...(state.draftRejections || []),
        { why: String(why).slice(0, 500), againstPrd: s.prdHash, at: new Date().toISOString() }
      ]
      delete state.draftRejection
    } else throw new Error(`unknown act: ${act}`)
  } else if (gate === 'screen') {
    if (act === 'approve') { state.screenApprovedAgainstDraft = s.draftHash; delete state.screenRejections }
    else if (act === 'unapprove') delete state.screenApprovedAgainstDraft
    else if (act === 'reject') {
      // Same rule as gate A: a rejection with no reason clears an approval and says nothing
      // about what to change, which is strictly worse than not rejecting at all.
      if (!String(why || '').trim()) throw new Error('a rejection needs a reason')
      delete state.screenApprovedAgainstDraft
      state.screenRejections = [
        ...(state.screenRejections || []),
        { why: String(why).slice(0, 500), againstDraft: s.draftHash, at: new Date().toISOString() }
      ]
    } else throw new Error(`unknown act: ${act}`)
  } else throw new Error(`unknown gate: ${gate}`)

  writeState(screen, state)
  build()
  return state
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/api/live') {
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'
    })
    res.write(': connected\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  // Running the suite is a fixed, known command — not arbitrary execution — but it is still a
  // POST that starts a process, so a cross-site page must not be able to trigger it. Same-origin
  // when a browser sends an Origin; tools without one (curl, the test suite) are unaffected.
  const origin = req.headers.origin
  const sameOrigin = !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`
  if (req.method === 'POST' && !sameOrigin) {
    res.writeHead(403, { 'content-type': 'text/plain' }); res.end('cross-origin refused'); return
  }

  if (url.pathname === '/api/run' && req.method === 'POST') {
    try {
      const { screen, grep, headed } = JSON.parse(await readBody(req) || '{}')
      if (screen && !allScreens().some(s => s.name === screen)) throw new Error(`no such screen: ${screen}`)
      startRun(screen || null, { grep, headed })
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"started":true}')
    } catch (err) {
      res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }

  if (url.pathname === '/api/dispatch' && req.method === 'POST') {
    try {
      const { screen } = JSON.parse(await readBody(req) || '{}')
      startDispatch(screen)
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"started":true}')
    } catch (err) {
      res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }

  // A job you cannot stop is a job you have to wait out. A redraft takes minutes, and noticing
  // ten seconds in that you rejected the wrong screen should not cost the other four.
  if (url.pathname === '/api/cancel' && req.method === 'POST') {
    try {
      const what = cancelJob()
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ cancelled: what }))
    } catch (err) {
      res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }

  if (url.pathname === '/api/conflicts') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ...readConflicts(), running: running ? running.kind : null }))
    return
  }

  if (url.pathname === '/api/scan' && req.method === 'POST') {
    try {
      startScan()
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"started":true}')
    } catch (err) {
      res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }

  // Recording a decision is instant and always allowed — it is the CEO's answer, and it must not
  // be able to fail because some unrelated job happens to be running.
  if (url.pathname === '/api/conflict' && req.method === 'POST') {
    try {
      const out = decideConflict(JSON.parse(await readBody(req) || '{}'))
      notify()
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out))
    } catch (err) {
      res.writeHead(400, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }

  if (url.pathname === '/api/rewrite' && req.method === 'POST') {
    try {
      const { key } = JSON.parse(await readBody(req) || '{}')
      startRewrite(key)
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"started":true}')
    } catch (err) {
      res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }

  if (url.pathname === '/api/config') {
    if (req.method === 'POST') {
      try {
        const cfg = writeConfig(JSON.parse(await readBody(req) || '{}'))
        build(); notify()
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(cfg))
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain' }); res.end(err.message)
      }
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(readConfig()))
    return
  }

  if (url.pathname === '/api/crawl') {
    if (req.method === 'POST') {
      try {
        startCrawl()
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"started":true}')
      } catch (err) {
        res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
      }
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ...readCrawl(), config: readConfig(), running: running ? running.kind : null }))
    return
  }

  if (url.pathname === '/api/watch' && req.method === 'POST') {
    const { on } = JSON.parse(await readBody(req) || '{}')
    watchOn = !!on
    push('watch', { on: watchOn })
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ on: watchOn }))
    return
  }

  if (url.pathname === '/api/runs') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ runs: readRuns(), running: running ? running.screen : null, watch: watchOn }))
    return
  }

  if (url.pathname === '/api/gate' && req.method === 'POST') {
    try {
      const state = applyGate(JSON.parse(await readBody(req)))
      // state.json is excluded from the file watcher (writing it would rebuild, which rewrites,
      // which rebuilds…), so a decision has to push its own notification. Without this a second
      // open board — or the same board after an API call — keeps showing the old verdict and
      // quietly disagrees with what is on disk.
      notify()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(state))
    } catch (err) {
      res.writeHead(400, { 'content-type': 'text/plain' })
      res.end(err.message)
    }
    return
  }

  // static ---------------------------------------------------------------
  // ALLOWLIST, not a traversal guard. Confining reads to the repo root is not enough: this
  // plugin runs inside somebody's project, so "anything under the repo" includes .git/config
  // with its remote URLs, .env, credentials and every file they have ever committed — all
  // readable by anything that can reach this port. The board needs exactly two things.
  let p = decodeURIComponent(url.pathname)
  if (p === '/') p = '/board.html'
  const rel = normalize(p).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '')
  const allowed = rel === 'board.html' || rel.startsWith('spec/')
  const file = join(ROOT, rel)
  if (!allowed || !file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store'
  })
  res.end(readFileSync(file))
})

// Editing a PRD or a draft in your editor should move the board without you asking it to.
let pending = null
const rebuild = () => {
  clearTimeout(pending)
  pending = setTimeout(() => {
    try { console.log(build()); notify() } catch (err) { console.error(String(err.stderr || err)) }
  }, 120)
}
let watchPending = null
watch(SPEC, { recursive: true }, (_e, name) => {
  // Files the tool writes about its own decisions. They already rebuild and notify on their own
  // path, and reacting to them here would have the server answering its own writes.
  if (!name || name.endsWith('state.json') || name.endsWith('_conflict-decisions.json') ||
    name.includes('_state-snapshot') || name.includes('_dir-snapshot')) return
  // A run WRITES into spec/ — the report, the run log, the screenshots, the guard's snapshot.
  // Re-triggering on those would make watch mode chase its own tail forever, so they redraw the
  // board but are never a reason to run. A conflicts scan is the same: it changes what you have
  // to decide, never what the tests would say.
  const noRun = /_results\.json$|_results-index\.json$|_run-report\.json$|_runs\.json$|_state-snapshot|_dir-snapshot|_conflicts\.json$|_config\.json$|_crawl\.json$|screen\.png$|crawl\.png$/.test(name)
  rebuild()
  if (noRun) return

  if (!watchOn || running) return
  const screen = name.split('/')[0]
  const known = allScreens().some(s => s.name === screen)
  clearTimeout(watchPending)
  watchPending = setTimeout(() => {
    try { startRun(known ? screen : null) } catch (err) { /* a run started meanwhile */ }
  }, 400)
})

// Rendering picks up tools/ changes for free via the child process. Gate logic does not — it is
// imported — so say so plainly instead of letting an edit appear to do nothing.
watch(join(ROOT, 'tools'), (_e, name) => {
  if (!name || !name.endsWith('.mjs')) return
  rebuild()
  if (name === 'spec-store.mjs' || name === 'serve-board.mjs') {
    console.log(`\n  ${name} changed — restart  npm run board  for gate logic to take effect\n`)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`board  http://localhost:${PORT}`)
  console.log(build())
})
