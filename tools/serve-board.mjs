// The board server: serves the board, records your gate decisions, and reloads when the spec
// changes on disk.
//
// The board is a generated static file, so without this it can only ever be looked at. Approving
// a draft has to write something, and the thing it writes is the pin that later makes the draft
// go stale. That write is the whole task-management feature.

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, watch } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join, normalize, extname } from 'node:path'
import { ROOT, SPEC, readScreen, readState, writeState, readResults, allScreens } from './spec-store.mjs'

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
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
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
const readRuns = () => existsSync(RUNS) ? JSON.parse(readFileSync(RUNS, 'utf8')) : []

function recordRun (entry) {
  // A capped log, not a growing one. Twenty runs is enough to see a pattern and small enough that
  // nobody has to remember to prune it.
  const runs = [entry, ...readRuns()].slice(0, 20)
  writeFileSync(RUNS, JSON.stringify(runs, null, 2) + '\n')
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
function runJob ({ kind, label, prompt, changed, onDone }) {
  if (running) throw new Error('a job is already in progress')
  const started = Date.now()
  let transcript = ''

  const child = spawn('claude', ['-p', prompt, '--permission-mode', 'acceptEdits'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })

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

  const diagnose = () => {
    if (/401|OAuth|authenticate/i.test(transcript)) return 'claude is not authenticated — run  claude  and sign in'
    if (/command not found|ENOENT/i.test(transcript)) return 'the claude CLI is not on PATH'
    if (/permission/i.test(transcript)) return 'claude refused to write — check permissions'
    return 'nothing changed'
  }

  child.on('close', code => {
    let ok = false, note = ''
    try { ok = !!changed() } catch (e) { ok = false }
    note = ok ? (onDone ? onDone() : 'done') : diagnose()
    running = null
    try { build() } catch (err) { console.error(String(err.stderr || err)) }
    push('run', { state: 'done', kind, screen: label, ms: Date.now() - started, ok, total: 1, failed: ok ? 0 : 1, note })
    notify()
  })
}

const CONFLICTS = join(SPEC, '_conflicts.json')
export const readConflicts = () => existsSync(CONFLICTS)
  ? JSON.parse(readFileSync(CONFLICTS, 'utf8')) : { findings: [], scannedAt: null }

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
  const before = existsSync(CONFLICTS) ? readFileSync(CONFLICTS, 'utf8') : ''
  runJob({
    kind: 'scan',
    label: 'conflict scan',
    prompt: scanPrompt(),
    changed: () => {
      if (!existsSync(CONFLICTS)) return false
      const now = readFileSync(CONFLICTS, 'utf8')
      JSON.parse(now) // must be valid JSON or it did not do the job
      return now !== before || JSON.parse(now).findings !== undefined
    },
    onDone: () => `${readConflicts().findings.length} contradiction(s) found`
  })
}

function startDispatch (screenName) {
  if (running) throw new Error('a job is already in progress')
  const s = readScreen(screenName)
  if (!s) throw new Error(`no such screen: ${screenName}`)

  const started = Date.now()
  // stdin closed, not inherited: claude waits 3s for piped input otherwise and warns about it,
  // which looks like a hang in the panel before anything has even started.
  const child = spawn('claude', [
    '-p', redraftPrompt(s),
    '--permission-mode', 'acceptEdits'
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })

  let transcript = ''

  running = { screen: screenName, started, child, kind: 'redraft' }
  push('run', { state: 'started', screen: screenName, kind: 'redraft' })

  const feed = buf => {
    transcript += String(buf)
    for (const line of String(buf).split('\n')) {
      if (line.trim()) push('run', { state: 'line', line: line.replace(/\[[0-9;]*m/g, '').slice(0, 300) })
    }
  }
  child.stdout.on('data', feed)
  child.stderr.on('data', feed)

  child.on('error', err => {
    push('run', { state: 'line', line: `could not start claude: ${err.message}` })
  })

  // "the draft did not change" is true but useless when the real reason is that the agent never
  // got to run. Name the cause, because an expired login is fixed in one command and a silent
  // no-op sends you reading the prompt instead.
  const diagnose = () => {
    if (/401|OAuth|authenticate/i.test(transcript)) {
      return 'claude is not authenticated — run  claude  in a terminal and sign in, then retry'
    }
    if (/command not found|ENOENT/i.test(transcript)) return 'the claude CLI is not on PATH'
    if (/permission/i.test(transcript)) return 'claude refused to write the file — check permissions'
    return 'the draft did not change'
  }

  child.on('close', code => {
    const after = readScreen(screenName)
    // Did it actually change the file? "The agent exited 0" is not the same as "the draft moved",
    // and reporting success for a no-op is how you learn to stop trusting the panel.
    const changed = after && after.draftHash !== s.draftHash
    if (changed) {
      const st = readState(screenName)
      // a fresh draft answers the old objections — the gate reopens on its own merits
      delete st.draftRejections
      delete st.draftRejection
      delete st.draftApprovedAgainstPrd
      writeState(screenName, st)
    }
    running = null
    try { build() } catch (err) { console.error(String(err.stderr || err)) }
    push('run', {
      state: 'done', kind: 'redraft', screen: screenName, ms: Date.now() - started,
      ok: code === 0 && changed, total: 1, failed: changed ? 0 : 1,
      note: changed ? 'draft rewritten — gate A is open again' : diagnose()
    })
    notify()
  })
}

function startRun (screen) {
  if (running) throw new Error('a run is already in progress')
  const args = ['playwright', 'test', '--config=playwright.board.ts']
  // the only interpolated value, and it is checked against real directories before it is used
  if (screen) args.push(join('spec', screen, 'test.spec.ts'))

  const started = Date.now()
  const child = spawn('npx', args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } })
  running = { screen: screen || 'all', started, child }
  push('run', { state: 'started', screen: running.screen })

  const feed = buf => {
    for (const line of String(buf).split('\n')) {
      if (line.trim()) push('run', { state: 'line', line: line.replace(/\[[0-9;]*m/g, '').slice(0, 300) })
    }
  }
  child.stdout.on('data', feed)
  child.stderr.on('data', feed)

  child.on('close', code => {
    const results = readResults()
    const totals = Object.values(results).reduce(
      (a, r) => ({ total: a.total + r.total, failed: a.failed + r.failed }), { total: 0, failed: 0 })
    const entry = {
      at: new Date(started).toISOString(),
      screen: running.screen,
      ms: Date.now() - started,
      ...totals,
      ok: code === 0
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
      const { screen } = JSON.parse(await readBody(req) || '{}')
      if (screen && !allScreens().some(s => s.name === screen)) throw new Error(`no such screen: ${screen}`)
      startRun(screen || null)
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
  if (!name || name.endsWith('state.json')) return
  // A run WRITES into spec/ — the report, the run log, the screenshots. Re-triggering on those
  // would make watch mode chase its own tail forever, so they are never a reason to run.
  const isRunOutput = /_results\.json$|_runs\.json$|screen\.png$/.test(name)
  if (isRunOutput) { rebuild(); return }
  rebuild()

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
