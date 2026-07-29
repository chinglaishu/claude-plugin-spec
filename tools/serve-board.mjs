// The board server: serves the board, records your gate decisions, and reloads when the spec
// changes on disk.
//
// The board is a generated static file, so without this it can only ever be looked at. Approving
// a draft has to write something, and the thing it writes is the pin that later makes the draft
// go stale. That write is the whole task-management feature.

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, watch, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join, normalize, extname, resolve, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import {
  ROOT, SPEC, readScreen, readState, writeState, allScreens,
  CONFLICTS, readConflicts, readDecisions, writeDecisions, sideFile,
  CRAWL, readConfig, writeConfig, readCrawl, parseReport, writeJson, writeText,
  RUNS, readRuns, recordRunEntry
} from './spec-store.mjs'
import { shipToGit, shipToBucket } from './ship-record.mjs'

// BOARD_PORT is the one knob, so `npm run board`, the README and playwright.board.ts all agree on it.
// PORT is still honoured as a fallback (some hosts inject it), and 4173 is the default — override it
// when this vendored board would otherwise collide with specboard's own dev board on the same port.
const PORT = Number(process.env.BOARD_PORT || process.env.PORT || 4173)

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
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webm': 'video/webm',
  '.log': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
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
// The runs a nested run is standing on. Bounded to one entry, so "a run may nest" can never become
// "a suite runs itself forever". `running` is always the INNERMOST job; finishing pops back.
const runStack = []
let watchOn = false

const RUNDIR = join(SPEC, '_runs')
// RUNS / readRuns / recordRunEntry live in spec-store now, shared with the reporter so a CLI or crawl
// run records into the same "recent runs" log a board-started run does.

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
  const runs = recordRunEntry(entry)
  const keep = new Set(runs.map(r => r.runId).filter(Boolean))
  for (const name of (existsSync(RUNDIR) ? readdirSync(RUNDIR) : [])) {
    if (!keep.has(name)) rmSync(join(RUNDIR, name), { recursive: true, force: true })
  }
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
// `runId` is optional and means "cancel this job, or nothing". Unnamed, cancel stops whatever holds
// the slot — which is what the panel's Cancel button wants. Named, it refuses unless it is really
// that job: a run asking to cancel the job it started must not silently kill the run it is nested
// in when that job has already finished. (It did: the suite cancelled itself and died mid-run.)
function cancelJob (runId) {
  if (!running) throw new Error('nothing is running')
  if (runId && runId !== running.runId) throw new Error('nothing is running by that name')
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
function crawlDraftPrompt (routes, cfg = {}) {
  const base = cfg.baseUrl || '<the app base URL from spec/_config.json>'
  const targets = routes.filter(r => !r.exists)
  const list = targets.map(r =>
    `- route ${r.route} → spec/${r.slug}/prd.md` +
    (r.title ? ` (page title: ${r.title})` : '') +
    (r.headings ? `\n  headings on the page: ${r.headings}` : '')).join('\n')
  return [
    'A crawl visited this project\'s running app and captured each route. For every route below, write',
    'a GUESSED but DETAILED product requirement document at the given path. Read the kg-init skill\'s',
    '"drive the screen, don\'t skim it" section first: the PRD must be detailed enough that a tester',
    'could list every number, control and flow to check from it alone — a two-line summary is a failure.',
    '',
    `DRIVE the screen, do not infer from its shell. The running app is at ${base}. For each route, open`,
    `${base}<route> and explore it (reuse the saved login session; a signIn is in spec/_config.json):`,
    '- harvest every data-testid on the page (metrics, grids, charts, panels) and name them in the PRD;',
    '- name every metric/tile (and that it carries a value), table (its columns), chart, and control',
    '  (buttons, toggles, selects, search, sliders) with its label;',
    '- note read-only vs editable state (a lock indicator? a separate draft/edit surface?) and any',
    '  modal or notice that overlays the screen;',
    '- probe the primary interactions (move a lever, open a menu, follow a cross-page link) and write',
    '  the OBSERVED EFFECT into the PRD, not just that a control exists.',
    'If you cannot reach the live app, spec/<slug>/crawl.png is the captured screenshot — but a PRD',
    'from a screenshot alone will be shallow; prefer driving the app.',
    '',
    'Each file must start with this frontmatter, guess included:',
    '',
    '---',
    'screen: <slug>',
    'area: Crawled',
    'title: <a short human name for the screen>',
    'route: <the route>',
    'guess: true',
    '---',
    '',
    'Then `## R<n> — <behaviour>` blocks — ONE per meaningful behaviour, each naming the concrete',
    'elements (put their data-testids in an HTML comment). The `guess: true` line is not optional: this',
    'is a proposal for the CEO to correct, never canon. Do not remove it, and do not approve anything.',
    '',
    'Routes to draft (skip any file that already exists — its screen is already on the board):',
    list,
    '',
    'Write only those prd.md files. Change nothing else. Do not explain.'
  ].join('\n')
}

// Phase three of a brownfield crawl: having guessed a PRD per route, author the E2E test that proves
// each one — a CHARACTERIZATION test against the running app, which also shoots screen.png. This is
// what makes a crawled row land as PRD + current screen + passing test with NO wireframe (document
// mode), keeping column 3 a byproduct of column 4 rather than a copy of crawl.png. It follows the
// kg-e2e skill; the model reads it there rather than having the whole convention inlined here.
function crawlTestPrompt (screens, cfg) {
  const base = cfg.baseUrl || '<the app base URL from spec/_config.json>'
  const list = screens.map(s =>
    `- spec/${s.name}/test.spec.ts  — proves spec/${s.name}/prd.md, screen at ${base}${s.route || '/' + s.name}` +
    ` (evidence: spec/${s.name}/crawl.png)`).join('\n')
  return [
    'A crawl has drafted a guessed PRD for each screen below. Author the E2E test that proves each',
    'PRD and, as a byproduct, shoots its screen.png — a CHARACTERIZATION test that locks in the',
    'running app\'s CURRENT behaviour as the baseline. Follow the kg-e2e skill.',
    '',
    'For each screen write spec/<screen>/test.spec.ts:',
    '- import { test, expect } from \'../_base\'',
    `- navigate to the REAL running app: page.goto('${base}' + the screen's route (an absolute URL)`,
    '- one test per requirement in that screen\'s prd.md, asserting the behaviour it names — never',
    '  merely that the page loaded (a test that passes with the requirement deleted is not a test)',
    '- the LAST test shoots the screenshot: await page.screenshot({ path: \'spec/<screen>/screen.png\', fullPage: false })',
    '  — column 3 is this byproduct, never captured any other way',
    'Read spec/<screen>/crawl.png to see what the screen looks like.',
    '',
    list,
    '',
    'Write only those test.spec.ts files. Change nothing else. Do not run anything. Do not explain.'
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
    const drafter = spawn('claude', ['-p', crawlDraftPrompt(manifest.routes, cfg), '--permission-mode', 'acceptEdits'],
      { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })
    running.child = drafter
    drafter.stdout.on('data', feed)
    drafter.stderr.on('data', feed)
    drafter.on('error', err => push('run', { state: 'line', line: `could not start claude: ${err.message}` }))
    drafter.on('close', () => {
      const newScreens = allScreens().filter(s => !before.has(s.name))
      if (!newScreens.length) {
        finishCrawl(started, false, running && running.cancelled ? 'cancelled — partial crawl left in place'
          : /401|OAuth|authenticate/i.test(transcript) ? 'crawled, but claude is not authenticated — sign in and rerun to draft'
            : 'crawled, but no rows were drafted')
        return
      }
      if (running && running.cancelled) { finishCrawl(started, true, 'cancelled — partial crawl left in place'); return }

      // Phase three: author a characterization test per new screen, so each lands as a DOCUMENT-mode
      // row (PRD + current screen + test, no wireframe) rather than a bare guessed PRD. Same panel,
      // same job — chained so Cancel still reaches whatever child is live.
      push('run', { state: 'line', line: `drafting ${newScreens.length} characterization test(s)…` })
      const tester = spawn('claude', ['-p', crawlTestPrompt(newScreens, cfg), '--permission-mode', 'acceptEdits'],
        { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })
      running.child = tester
      tester.stdout.on('data', feed)
      tester.stderr.on('data', feed)
      tester.on('error', err => push('run', { state: 'line', line: `could not start claude: ${err.message}` }))
      tester.on('close', () => {
        if (running && running.cancelled) { finishCrawl(started, true, 'cancelled — partial crawl left in place'); return }
        const specs = newScreens
          .map(s => `spec/${s.name}/test.spec.ts`)
          .filter(f => existsSync(join(ROOT, f)))
        if (!specs.length) {
          finishCrawl(started, true, `crawled ${manifest.routes.length} route(s) · ${newScreens.length} documented (PRD only — no test authored; accept them at the PRD gate)`)
          return
        }

        // Phase four: run those tests. This produces each screen.png (column 3, a byproduct) and the
        // suite's own reporter folds the results into the per-screen index (column 4). The board
        // server is reused by the run (reuseExistingServer); the tests hit the REAL app, not it.
        push('run', { state: 'line', line: `running ${specs.length} new test(s)…` })
        const runner = spawn('npx', ['playwright', 'test', '--config', 'playwright.board.ts', ...specs],
          { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })
        running.child = runner
        runner.stdout.on('data', feed)
        runner.stderr.on('data', feed)
        runner.on('error', err => push('run', { state: 'line', line: `could not start playwright: ${err.message}` }))
        runner.on('close', () => {
          const proven = allScreens().filter(s => !before.has(s.name) && s.cells.e2e === 'pass').length
          finishCrawl(started, true,
            `crawled ${manifest.routes.length} route(s) · ${newScreens.length} documented, ${proven} with a passing test — accept the requirements at the PRD gate`)
        })
      })
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
  // R4: the slot is global, and a person's second job is refused. The ONE exception is the run that
  // is already holding the slot asking to nest — a spec that proves the run panel has to start a run
  // to have anything to prove, and without this the dispatch row is the only row the board cannot
  // run (it would wait for the slot its own run is holding, which is the blank-browser hang).
  // The caller must NAME the run it is nested in, so a person clicking Run twice is still refused,
  // and nesting stops at one level so a suite that runs itself cannot recurse.
  if (running) {
    const parent = String(opts.parent || '')
    // Bounded, not unlimited: a chain this short cannot recurse, and it leaves room for the case
    // that matters — the board runs a spec (1) which starts a run of its own (2).
    const mayNest = parent && parent === running.runId && runStack.length < 2
    if (!mayNest) throw new Error('a run is already in progress')
    runStack.push(running)
  }
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
  // The RECORD of this run: every screenshot and video Playwright captures while it drives the
  // app, kept per run so "what did the test actually see" is answerable afterwards rather than
  // only while you happened to be watching. Lives under spec/ because that is the only tree the
  // static server will serve.
  const runId = String(started)
  const recordDir = join(RUNDIR, runId)
  mkdirSync(recordDir, { recursive: true })
  // A run started BY the board writes to its OWN report file. Scoped to one screen it would
  // otherwise overwrite spec/_results.json — the file a concurrent full run (or the suite itself)
  // is also writing — and erase every other screen's result. It folds into the per-screen index
  // on close instead, so a one-screen run updates one screen and leaves the rest standing.
  // PER RUN, inside the run's own record: a nested run and the run it is nested in are both live at
  // once, and one shared report file would have each overwriting the other's results. Living in the
  // record dir also means it is pruned with the run rather than left behind in spec/.
  const report = join(recordDir, 'report.json')
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
  // Captured, not read off `running` at close: with nesting there can be two live runs, and the
  // slot holds the innermost — so a run must name itself from a local, never from the global.
  const myScreen = screen || 'all'
  running = { screen: myScreen, started, child, kind: 'tests', runId }
  push('run', { state: 'started', screen: myScreen })

  // R6: keep the WHOLE log, not just the lines that scrolled past. Accumulate every byte the run
  // printed; on close it is written beside the run's other artifacts so it can be read back in full
  // long after the panel that streamed it is gone.
  let log = ''
  const feed = buf => {
    log += String(buf)
    for (const line of String(buf).split('\n')) {
      if (line.trim()) push('run', { state: 'line', line: line.replace(/\[[0-9;]*m/g, '').slice(0, 300) })
    }
  }
  child.stdout.on('data', feed)
  child.stderr.on('data', feed)

  child.on('close', async code => {
    // the run's own reporter has already folded its results into the per-screen index by now; here
    // we only need this run's totals for the run-log, read from the report it wrote
    let fresh = {}
    try { fresh = parseReport(report) } catch { /* no report — the run never produced one */ }
    const totals = Object.values(fresh).reduce(
      (a, r) => ({ total: a.total + r.total, failed: a.failed + r.failed }), { total: 0, failed: 0 })
    // R6: write the whole log into this run's own record dir, so the prune that caps the run log
    // takes it away with everything else the run produced. FORCE_COLOR=0 already keeps it clean.
    try { writeFileSync(join(recordDir, 'run.log'), log.replace(/\x1b\[[0-9;]*m/g, '')) } catch { /* best effort: a missing log never fails a run */ }
    let shotsByTest = collectRecord(recordDir)
    // Ship the record where Setup says, if anywhere but local. Best effort: a failure records the
    // reason on the run and keeps the local copy, and never touches the verdict.
    let archive = null
    const store = readConfig().storage || { where: 'local' }
    if (store.where === 'git' && Object.keys(shotsByTest).length) {
      archive = { where: 'git', ...shipToGit(recordDir, runId, store.gitBranch, ROOT, !!store.push) }
    } else if (store.where === 'bucket' && Object.keys(shotsByTest).length) {
      const r = await shipToBucket(recordDir, runId, shotsByTest, store.bucketUrl, ROOT)
      archive = { where: 'bucket', ok: r.ok, error: r.error, count: r.count }
      // point the board at the bucket copies, which outlive the local prune
      if (r.ok) shotsByTest = r.shotsByTest
    }
    const entry = {
      at: new Date(started).toISOString(),
      screen: myScreen,
      // WHICH case, when the run was scoped to one. "board 1/1" twice over says nothing about which
      // two tests those were, and a run log you cannot read back is a run log nobody consults.
      grep: grep || null,
      ms: Date.now() - started,
      ...totals,
      ok: code === 0,
      runId,
      // what each test SAW, keyed by title — the record is only useful if it can be looked at,
      // and only trustworthy if you can tell which test it belongs to
      shotsByTest,
      archive
    }
    recordRun(entry)
    // Pop, don't blank: a nested run finishing hands the slot back to the run it was nested in,
    // which is still going. Blanking here would free the slot while a run was live and let a person
    // start a second job alongside it — the exact thing the slot exists to refuse.
    running = runStack.pop() || null
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

  if (gate === 'prd') {
    // DOCUMENT mode's only gate. There is no wireframe here and no hash-staleness pin on the PRD —
    // the source of truth is simply the PRD once it stops being a guess. Accepting a crawled guess
    // strips the `guess` flag and NOTHING else: the server never edits a requirement's prose, only
    // this one state marker. No pin is written, so nothing here can later go "stale".
    if (act !== 'accept') throw new Error(`unknown act: ${act}`)
    if (!s.guess) throw new Error('nothing to accept — this PRD is not a guess')
    // Strip the flag from the FRONTMATTER block only — scope the edit to the opening `---…---` fence
    // so a requirement's PROSE is never touched, not even a body line that happens to begin "guess:".
    const stripped = s.prdText.replace(/^(---\n[\s\S]*?\n---\n)/,
      block => block.replace(/^guess:[^\n]*\n/m, ''))
    writeText(join(SPEC, screen, 'prd.md'), stripped)
    build()
    return readState(screen)
  }

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
    // Gate B compares the built screen against the APPROVED DESIGN. A document-mode screen has no
    // wireframe, so there is nothing to compare against and no gate B to open — approving one would
    // pin against a null draft hash, a meaningless pin. Refuse it rather than record a lie.
    if (!existsSync(join(SPEC, screen, 'draft.html'))) {
      throw new Error('no wireframe — this screen has no gate B; its test is what proves it')
    }
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

// The skills and agents that drive this board — read from disk at REQUEST time so an edited
// SKILL.md shows up on the very next page load. This returns parsed frontmatter (name + one-line
// description), never file bytes, so it does NOT widen the static allowlist. Two roots: the project
// itself (ROOT) for anything it has added under .claude/, and the specboard PLUGIN for its own
// vendored skills — which live in different places depending on how the plugin was installed.
const parseCapFrontmatter = text => {
  const fm = {}
  const m = String(text).match(/^---\n([\s\S]*?)\n---/)
  if (!m) return fm
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(': ')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    if (k) fm[k] = line.slice(i + 2).trim()
  }
  return fm
}

const cmpSemver = (a, b) => {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

const readJsonSafe = file => {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch (e) { return null }
}

// The release a scaffolded project records — used to pick the matching cached plugin version, and
// as a version fallback when the plugin folder itself carries no plugin.json.
const projectRelease = projectRoot => {
  const j = readJsonSafe(join(projectRoot, 'spec/_specboard.json'))
  return (j && (j.release || j.version)) || null
}

// Where specboard's OWN skills live. First hit wins: an explicit override; the dogfood case where
// this repo IS the plugin; the installed-plugins manifest; then the newest cached copy.
const resolvePluginRoot = projectRoot => {
  const p = process.env.CLAUDE_PLUGIN_ROOT
  if (p && existsSync(p)) return p
  if (existsSync(join(projectRoot, '.claude-plugin/plugin.json')) && existsSync(join(projectRoot, 'skills'))) {
    return projectRoot
  }
  const home = homedir()
  const manifest = readJsonSafe(join(home, '.claude/plugins/installed_plugins.json'))
  if (manifest && manifest.plugins) {
    const key = Object.keys(manifest.plugins).find(k => /^specboard@/.test(k))
    const entry = key && manifest.plugins[key] && manifest.plugins[key][0]
    if (entry && entry.installPath && existsSync(entry.installPath)) return entry.installPath
  }
  const cache = join(home, '.claude/plugins/cache/specboard/specboard')
  try {
    const vers = readdirSync(cache).filter(v => existsSync(join(cache, v, 'skills')))
    if (vers.length) {
      const wanted = projectRelease(projectRoot)
      if (wanted && vers.includes(wanted)) return join(cache, wanted)
      return join(cache, vers.sort(cmpSemver)[vers.length - 1])
    }
  } catch (e) { /* no cache — unresolved */ }
  return null
}

// every **/SKILL.md under a directory (the project may nest its skills)
const findSkillMd = dir => {
  const out = []
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...findSkillMd(full))
    else if (e.isFile() && e.name === 'SKILL.md') out.push(full)
  }
  return out
}

function readCapabilities () {
  const projectRoot = ROOT
  const pluginRoot = resolvePluginRoot(projectRoot)
  const seen = new Set()
  const caps = []
  const add = (file, meta) => {
    const key = resolve(file)
    if (seen.has(key)) return
    let text
    try { text = readFileSync(file, 'utf8') } catch (e) { return }
    seen.add(key)
    const fm = parseCapFrontmatter(text)
    caps.push({
      name: fm.name || meta.fallback,
      description: fm.description || '',
      kind: meta.kind, source: meta.source, path: key
    })
  }

  let version = null
  if (pluginRoot) {
    version = (readJsonSafe(join(pluginRoot, '.claude-plugin/plugin.json')) || {}).version ||
      projectRelease(projectRoot) || (basename(pluginRoot).match(/^\d+\.\d+\.\d+$/) ? basename(pluginRoot) : null)
    const skillsDir = join(pluginRoot, 'skills')
    try {
      for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const file = join(skillsDir, d.name, 'SKILL.md')
        if (existsSync(file)) add(file, { kind: 'skill', source: 'specboard', fallback: d.name })
      }
    } catch (e) { /* no skills dir — leave specboard caps empty */ }
  }

  // the project's own additions — skills nested under .claude/skills, agents flat in .claude/agents
  for (const file of findSkillMd(join(projectRoot, '.claude/skills'))) {
    add(file, { kind: 'skill', source: 'project', fallback: basename(dirname(file)) })
  }
  try {
    for (const d of readdirSync(join(projectRoot, '.claude/agents'), { withFileTypes: true })) {
      if (d.isFile() && d.name.endsWith('.md')) {
        add(join(projectRoot, '.claude/agents', d.name),
          { kind: 'agent', source: 'project', fallback: d.name.replace(/\.md$/, '') })
      }
    }
  } catch (e) { /* no agents dir */ }

  return {
    specboard: { available: !!pluginRoot, version, root: pluginRoot },
    project: { root: projectRoot },
    capabilities: caps
  }
}

// Where the vendored board stands against the installed plugin. The PROJECT records its own release
// in spec/_specboard.json (written by scaffold/update); the PLUGIN carries its version in
// .claude-plugin/plugin.json. An update is offered only when the plugin is strictly newer AND we can
// actually locate it to update from — so the UI never proposes an update it could not perform, and
// the source repo (no manifest, current = null) never offers to update itself against itself.
function updateStatus () {
  const pluginRoot = resolvePluginRoot(ROOT)
  const current = projectRelease(ROOT)
  const latest = pluginRoot
    ? (readJsonSafe(join(pluginRoot, '.claude-plugin/plugin.json')) || {}).version || null
    : null
  const updateAvailable = !!(pluginRoot && current && latest && cmpSemver(latest, current) > 0)
  return { current: current || null, latest, updateAvailable, pluginRoot: pluginRoot || null }
}

// Run the plugin's kg-update against THIS project, then rebuild the board. tools/update.mjs is the
// vendored updater: it uses the project's spec/_specboard.json as its base, keeps files you have
// edited, and drops a <file>.new beside anything it cannot safely overwrite (exit 2 = conflicts).
// We deliberately do NOT self-kill or restart: the board is expected to run under `node --watch`, so
// update.mjs overwriting tools/serve-board.mjs restarts the process on its own — which may drop this
// very request's socket. That is fine; the page treats a dropped socket as "restarting" and reloads
// once the new server answers. Best-effort build() here covers the plain-node case that does not
// restart; when --watch does restart, the fresh server rebuilds on boot anyway.
function runUpdate () {
  return new Promise((ok, bad) => {
    const pluginRoot = resolvePluginRoot(ROOT)
    if (!pluginRoot) { bad(new Error('cannot locate the specboard plugin to update from')); return }
    const updater = join(pluginRoot, 'tools/update.mjs')
    if (!existsSync(updater)) { bad(new Error('the plugin has no updater at ' + updater)); return }
    let out = ''
    const child = spawn(process.execPath, [updater, ROOT], { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } })
    child.stdout.on('data', b => { out += String(b) })
    child.stderr.on('data', b => { out += String(b) })
    child.on('error', err => bad(err))
    child.on('close', code => {
      try { build() } catch (err) { out += '\n' + String(err.stderr || err) }
      ok({ ok: code === 0, exit: code, report: out.trim(), conflicts: code === 2, version: projectRelease(ROOT) })
    })
  })
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
      const { screen, grep, headed, parent } = JSON.parse(await readBody(req) || '{}')
      if (screen && !allScreens().some(s => s.name === screen)) throw new Error(`no such screen: ${screen}`)
      // `parent` is how a run asks to nest inside itself (R4). It is checked against the runId the
      // server itself issued, so naming someone else's run — or guessing — refuses like any other
      // second job.
      startRun(screen || null, { grep, headed, parent })
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
      const { runId: cancelId } = JSON.parse(await readBody(req) || '{}')
      const what = cancelJob(cancelId)
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
    // runningId names WHICH run holds the slot. A run asking whether the board is free has to be
    // able to tell "something else is in the way" from "the thing in the way is me" — without it,
    // a spec started by the board waits for itself forever (R4).
    res.end(JSON.stringify({
      runs: readRuns(),
      running: running ? running.screen : null,
      runningId: running ? running.runId : null,
      watch: watchOn
    }))
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

  // What drives the board — the specboard skills, plus any skills/agents this project has added.
  // Scanned live so the How-it-works page reflects an edited or added SKILL.md on the next load. It
  // returns metadata only, so it is safe to answer BEFORE the static allowlist without widening it.
  if (url.pathname === '/api/capabilities') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(readCapabilities()))
    return
  }

  // Where the vendored board stands against the installed plugin, and whether an update is offered.
  // JSON only — like /api/capabilities it answers BEFORE the static allowlist without widening it.
  if (url.pathname === '/api/update-status') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(updateStatus()))
    return
  }

  // Update this project's vendored board to the installed plugin's release, with a click. Runs the
  // plugin's kg-update, rebuilds board.html, and reports. Under `node --watch` the update restarts
  // the server, so this response may never reach the client — that is expected and handled in the page.
  if (url.pathname === '/api/update' && req.method === 'POST') {
    try {
      const out = await runUpdate()
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }); res.end(err.message)
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
  const noRun = /_results\.json$|_results-index\.json$|_run-report\.json$|_runs\.json$|_runs\/|_state-snapshot|_dir-snapshot|_conflicts\.json$|_config\.json$|_crawl\.json$|screen\.png$|crawl\.png$/.test(name)
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
// imported — so it needs a fresh process. `npm run board` runs under `node --watch`, which restarts
// on exactly these files, so the note only matters if you launched the server some other way.
watch(join(ROOT, 'tools'), (_e, name) => {
  if (!name || !name.endsWith('.mjs')) return
  rebuild()
  if (name === 'spec-store.mjs' || name === 'serve-board.mjs') {
    console.log(`\n  ${name} changed — npm run board (node --watch) restarts to apply it; a plain node run needs a manual restart\n`)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`board  http://localhost:${PORT}`)
  console.log(build())
})
