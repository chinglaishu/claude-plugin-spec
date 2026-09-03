// The board server: serves the board, records your gate decisions, and reloads when the spec
// changes on disk.
//
// The board is a generated static file, so without this it can only ever be looked at. Approving
// a draft has to write something, and the thing it writes is the pin that later makes the draft
// go stale. That write is the whole task-management feature.

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join, normalize, extname, resolve, dirname, basename, relative } from 'node:path'
import { homedir } from 'node:os'
import {
  composeBlockedBy,
  ROOT, SPEC, allScreens,
  CONFLICTS, readConflicts, readDecisions, writeDecisions, sideFile,
  CRAWL, readConfig, writeConfig, readCrawl, parseReport, writeJson,
  RUNS, readRuns, recordRunEntry, reEscape, runVerdict, readResults, slotAfterClose,
  shouldVoice, narrationPack, voiceReadiness, voicesDir
} from './spec-store.mjs'
// pure (no fs, no clock) — safe to import here; the BUILDER still runs as a child process below
import { deriveChapters, deriveKind } from './flow.mjs'
// pure (no fs) — the flow composer's library derivation, joint check, emitter and prompt (Task 5)
import { deriveLibrary, composeCheck, emitFlow, composePrompt, flowLanded, validFlowName } from './compose.mjs'
import { shipToGit, shipToBucket } from './ship-record.mjs'
// every fs.watch in this file goes through watchDir — an unhandled FSWatcher 'error' is a THROW that
// takes the SERVER with it, and a deleted watched directory raises exactly that on Linux (see
// tools/watch-dir.mjs for the CI crash this comes from)
import { watchDir } from './watch-dir.mjs'

// BOARD_PORT is the one knob, so `npm run board`, the README and playwright.board.ts all agree on it.
// PORT is honoured as a fallback (some hosts inject it — dojostack's launchd sets it). A scaffolded
// project also bakes its OWN assigned port into the `board` script as `--port <n>` (kg-init picks a
// free one), so two projects on one machine never both default to 4173 and collide. An explicit
// BOARD_PORT/PORT env still wins; 4173 is the last resort.
const argPort = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? process.argv[i + 1] : '' })()
const PORT = Number(process.env.BOARD_PORT || process.env.PORT || argPort || 4173)

// The builder runs as a CHILD PROCESS, not an import. Node caches ES modules for the life of the
// process, so an imported build() keeps rendering with the code it was started with — and since
// the watcher rebuilds on every spec change, a long-running server will happily overwrite a
// freshly built board.html with output from the version you edited an hour ago. It looks exactly
// like your edit had no effect, which is the worst kind of bug to be handed.
const build = () =>
  execFileSync(process.execPath, [join(ROOT, 'tools/build-board.mjs')], { cwd: ROOT })
    .toString().trim()

// board.html is a generated static file. Every writing POST (the gate is gone — board R8; today:
// conflict decisions, compose) rebuilds it before it responds, and the file-watcher rebuilds on any
// spec change — EXCEPT state.json, which is deliberately excluded (a pre-redesign relic; a write on
// the server's own path already rebuilds, and reacting to it in the watcher
// would double every rebuild). But a test — or a second tool — can write a state.json DIRECTLY, and
// then a plain page load would serve a board that predates the pin. So on a GET for board.html, if any
// state.json is newer than board.html, rebuild synchronously first. Narrow to state.json only, so the
// hot path stays cheap and this never fires for changes the watcher already caught.
const BOARD_HTML = join(ROOT, 'board.html')
function boardStaleAgainstState () {
  if (!existsSync(BOARD_HTML)) return true
  const bt = statSync(BOARD_HTML).mtimeMs
  for (const n of readdirSync(SPEC)) {
    if (n.startsWith('_')) continue
    const p = join(SPEC, n, 'state.json')
    try { if (existsSync(p) && statSync(p).mtimeMs > bt) return true } catch { /* raced deletion */ }
  }
  return false
}

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

// PROOF FRAMES (board R14): cut one still per checked value from a run's recording, at the instant
// that check fired — indexed by the step record's own video-time offsets (`t`, ms from the recording's
// t=0, which the reporter stamps on every step). Each cut carries the topbar the run burned in and the
// ring on the value, because it is a FRAME OF THE RECORDING, never a separate capture — so a run with
// no video yields none, honestly (R14). Best-effort and bounded: a missing ffmpeg or a failed cut
// drops that frame (or the whole strip), never the run. Mutates shotsByTest, adding `frames` per test.
let FFMPEG
function ffmpegOk () {
  if (FFMPEG !== undefined) return FFMPEG
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); FFMPEG = true } catch { FFMPEG = false }
  return FFMPEG
}
let FFPROBE
function ffprobeOk () {
  if (FFPROBE !== undefined) return FFPROBE
  try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); FFPROBE = true } catch { FFPROBE = false }
  return FFPROBE
}

// VOICE READINESS PROBE (init R6). Setup asks "can this box actually voice a run?" so it can disable
// the switch until it can. Read live off the machine — a PATH scan (not running piper, which would
// block on stdin) and a readdir — so a re-check reflects a just-installed piper or a just-dropped model
// WITHOUT restarting the board (env-var config is fixed at launch; PATH and files are not). The pure
// gate + its human reason live in spec-store.voiceReadiness (unit-tested).
function onPath (bin) {
  for (const d of (process.env.PATH || '').split(':')) {
    if (!d) continue
    try { const s = statSync(join(d, bin)); if (s.isFile()) return true } catch { /* not here */ }
  }
  return false
}
function hasVoiceModel () {
  try { return readdirSync(voicesDir()).some(f => f.endsWith('.onnx')) } catch { return false }
}
function voiceStatus () {
  return voiceReadiness({
    ffmpeg: ffmpegOk(),
    ffprobe: ffprobeOk(),
    // a configured BOARD_SYNTH_CMD (e.g. a docker piper) counts as a synthesizer without piper on PATH
    synth: !!process.env.BOARD_SYNTH_CMD || onPath('piper'),
    voiceModel: hasVoiceModel()
  })
}
const GOT_EXP = / — got .+? · expected /   // the hudCheck claim shape emitNote writes into a note step
function frameSlug (s) {
  return String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'test'
}
// Turn a test's step record into the frames worth cutting: one per got-vs-expected CLAIM (the checked
// values), plus one per `proves <id>` step that carried no such claim (a meta assertion still deserves
// its verdict frame). Ordered by time and bounded, so a long flow cannot cut eighty stills.
function frameAnchors (steps) {
  const kept = (steps || []).filter(s => s && typeof s.t === 'number')
  const proveBefore = i => {
    for (let j = i - 1; j >= 0; j--) {
      if (kept[j].depth < kept[i].depth) { const m = /^proves (\S+)$/.exec(kept[j].label || ''); return m ? m[1] : '' }
    }
    return ''
  }
  const nextT = i => (i + 1 < kept.length ? kept[i + 1].t : kept[i].t + (kept[i].d || 0) + 1500)
  const anchors = []
  const provenWithValue = new Set()
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i]
    if (s.cat === 'info' && GOT_EXP.test(s.label || '')) {
      const req = proveBefore(i); if (req) provenWithValue.add(req)
      // The claim + ring paint at ~s.t and HOLD for the run's pace; land mid-hold. Adaptive off the gap
      // to the next step: a held check (proveVisible, ~2s hold → wide gap) samples ~1s in for a settled
      // read; a bare hudCheck with no hold (narrow gap) samples just past the paint, so the frame still
      // catches the claim before the flow moves on. Clamped so neither extreme misses.
      const t = Math.round(s.t + Math.max(120, Math.min(1200, (nextT(i) - s.t) * 0.5)))
      anchors.push({ t, ok: s.ok !== false, cap: String(s.label), req })
    }
  }
  for (let i = 0; i < kept.length; i++) {
    const m = kept[i].cat === 'test.step' && /^proves (\S+)$/.exec(kept[i].label || '')
    if (m && !provenWithValue.has(m[1])) {
      anchors.push({ t: Math.round(kept[i].t + Math.min(1500, (kept[i].d || 0) * 0.6)), ok: kept[i].ok !== false, cap: '', req: m[1] })
    }
  }
  return anchors.sort((a, b) => a.t - b.t).slice(0, 12)
}
function cutFrame (videoAbs, t, out) {
  // fast + accurate seek: a coarse pre-input seek to ~2s before, then decode the small remainder, so a
  // sparse-keyframe MediaRecorder webm still lands on the right frame without decoding from t=0.
  const coarse = Math.max(0, t - 2000) / 1000
  const fine = Math.max(0, t / 1000 - coarse)
  return new Promise(res => {
    const args = ['-y', '-loglevel', 'error', '-ss', String(coarse), '-i', videoAbs,
      '-ss', String(fine), '-frames:v', '1', '-vf', 'scale=760:-1', '-q:v', '3', out]
    let done = false
    const child = spawn('ffmpeg', args, { stdio: 'ignore' })
    const finish = ok => { if (!done) { done = true; res(ok) } }
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already gone */ } finish(false) }, 20000)
    child.on('error', () => { clearTimeout(timer); finish(false) })
    child.on('close', code => { clearTimeout(timer); finish(code === 0) })
  })
}
async function extractProofFrames (recordDir, shotsByTest) {
  if (!ffmpegOk()) return
  // one flat job list across all tests, run through a small pool so a run with many values does not
  // spawn dozens of ffmpegs at once nor block the event loop (the panel keeps streaming meanwhile)
  const jobs = []
  for (const [title, recd] of Object.entries(shotsByTest)) {
    if (!recd || !recd.video) continue
    const videoAbs = join(ROOT, recd.video)
    if (!existsSync(videoAbs)) continue
    const anchors = frameAnchors(recd.steps)
    if (!anchors.length) continue
    const dir = join(recordDir, 'frames', frameSlug(title))
    try { mkdirSync(dir, { recursive: true }) } catch { continue }
    recd._frames = []   // staged; promoted to recd.frames only for the cuts that succeed, in order
    anchors.forEach((a, i) => jobs.push({ recd, videoAbs, a, out: join(dir, i + '.png'), i }))
  }
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++]
      const ok = await cutFrame(j.videoAbs, j.a.t, j.out)
      if (ok && existsSync(j.out)) j.recd._frames.push({ img: relative(ROOT, j.out), ok: j.a.ok, cap: j.a.cap, req: j.a.req, t: j.a.t, i: j.i })
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker))
  for (const recd of Object.values(shotsByTest)) {
    if (recd && recd._frames) {
      if (recd._frames.length) recd.frames = recd._frames.sort((a, b) => a.i - b.i).map(({ i, ...f }) => f)
      delete recd._frames
    }
  }
}

// FLOW CHAPTERS (board R13): a test's kind (unit / flow) and its ordered chapters, DERIVED from the
// run's own recorded steps by the pure tools/flow.mjs — computed on the way OUT of /api/runs and
// never stored, so a CLI-recorded run and an old entry get theirs exactly like a board-started one
// (contrast the proof frames above, which must be cut at run close because they produce files).
// The qualified ids come from the committed index's per-test `reqs` keys; that declared set also
// rides along as `reqs` so the client can compose the NOT-REACHED chapters (a declared coverReqs
// screen no reached chapter ever landed on) — the reached chapters alone cannot say what a broken
// flow never got to (rule 3). The baked test tags carry only BARE ids, so this is the one carrier
// of the qualified set the player has.
function decorateRuns (runs) {
  let byTitle = null
  const lookup = title => {
    if (!byTitle) {
      byTitle = {}
      for (const [scr, r] of Object.entries(readResults())) {
        for (const t of r.tests || []) byTitle[t.title] = { screen: scr, reqs: Object.keys(t.reqs || {}) }
      }
    }
    return byTitle[title]
  }
  return runs.map(r => {
    if (!r || !r.shotsByTest) return r
    const shots = {}
    for (const [title, one] of Object.entries(r.shotsByTest)) {
      const hit = lookup(title)
      // a title the index does not know (its screen never folded) still chapters against the run's
      // own screen; an 'all' run with no index hit derives against '' — bare ids stay bare, no crash
      const screen = (hit && hit.screen) || (r.screen !== 'all' ? r.screen : '')
      const reqs = hit ? hit.reqs : []
      shots[title] = { ...one, reqs, kind: deriveKind(reqs, screen), chapters: deriveChapters(one && one.steps, screen) }
    }
    return { ...r, shotsByTest: shots }
  })
}

// Voice-over render (board R10). Lay the screen's narration onto the run's recording — piper voice
// muxed at the beat times, the same words burned in as subtitles — and point the record at the
// voiced mp4 so the player plays it in place of the silent one. Only when EXACTLY ONE test recorded a
// video: voice is a single-flow artifact, and one shared beat log cannot time two interleaved flows.
// The voiced file sits beside the recording (pruned and shipped with the run). Returns the voiced
// path on success, null when there was nothing to voice; THROWS only on a real render failure so the
// caller can report it and leave the silent recording in place. narrate-run's render is unit-proven
// to add an audio track (tools/voiceover.test.mjs).
function renderVoiced (shotsByTest, beatsFile, packFile) {
  if (!existsSync(beatsFile) || !existsSync(packFile)) return null   // no beats / no pack ⇒ nothing to voice
  const withVideo = Object.values(shotsByTest).filter(r => r && r.video)
  if (withVideo.length !== 1) return null                            // not a single flow ⇒ leave silent
  const recd = withVideo[0]
  const videoAbs = join(ROOT, recd.video)
  if (!existsSync(videoAbs)) return null
  const outAbs = videoAbs.replace(/\.\w+$/, '') + '.voiced.mp4'
  execFileSync(process.execPath, [join(ROOT, 'tools/narrate-run.mjs'), 'render',
    '--video', videoAbs, '--beats', beatsFile, '--pack', packFile, '--out', outAbs],
  { cwd: ROOT, stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } })
  if (!existsSync(outAbs)) return null
  recd.voiced = relative(ROOT, outAbs)     // spread through the run record → the player reads one.voiced
  return recd.voiced
}

function recordRun (entry) {
  // A capped log, not a growing one. Twenty runs is enough to see a pattern and small enough that
  // nobody has to remember to prune it — and the artifacts of a run that falls off the end go with
  // it, or the record directory grows without limit.
  const runs = recordRunEntry(entry)
  const keep = new Set(runs.map(r => r.runId).filter(Boolean))
  // NEVER prune a LIVE run's record dir. A run only enters the log at its own close, so while it
  // runs its directory is exactly the thing this sweep would call an orphan — and with takeover
  // (R4) siblings genuinely overlap: the superseded run's close, or a long close of an earlier
  // sibling, fired this prune while another run was mid-flight and deleted its record out from
  // under it. Its reporter then had nowhere to write shots.json, and the run came back with zero
  // per-case records (the R6/R8 "records every test case" failure, 2026-08-21 — surfaced when the
  // Task-15 evidence harvest lengthened the reporter's onEnd and widened the race window).
  for (const j of [running, ...runStack]) if (j && j.runId) keep.add(String(j.runId))
  for (const name of (existsSync(RUNDIR) ? readdirSync(RUNDIR) : [])) {
    if (!keep.has(name)) rmSync(join(RUNDIR, name), { recursive: true, force: true })
  }
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

// Releasing the slot when a job ends. A job that was TAKEN OVER (R4) must record itself but NOT touch
// the slot — the run that took over already holds it — so a run's close asks this instead of clearing
// `running` by hand (it used to pop unconditionally, and a superseded run's close then freed the
// slot while the takeover run was live, letting a second concurrent run start — Task 15 concern 4,
// reproduced 2026-08-21). For every other job the slot passes back to the run it was nested in, or
// to nobody. The rule itself is pure and unit-tested (slotAfterClose, tools/job-slot.test.mjs):
// only the current HOLDER's close releases; any other close just steps out of the ancestor chain.
// The plain agent jobs (redraft/scan/crawl) still clear `running` by hand at their own close —
// nothing can nest in or take over a non-run job, so they are always the holder when they end.
function releaseSlot (job) {
  const next = slotAfterClose(job, running, runStack)
  running = next.running
  runStack.length = 0
  for (const j of next.runStack) runStack.push(j)
}

// A person's second RUN takes the slot from the run holding it (R4, cancel-and-run). Only ever called
// when the holder is a test run: the run is cancelled (R5 — its partial work and log are kept) and
// marked superseded so its close will not release the slot back over the new run. runStack is left
// alone, so a taken-over NESTED run's ancestors keep the slot and resume once the new run ends — which
// is why a suite that runs itself can never be cancelled by a takeover of one of its nested runs.
function takeover () {
  running.superseded = true
  cancelJob(running.runId)
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
    'Two requirement documents contradict each other. The human has chosen which one is canon.',
    `The subject is: ${finding.subject}`,
    '',
    `## Canon — do NOT change this, it is the answer (${won.source})`,
    won.quote,
    '',
    `## Wrong — this is the claim you must remove (${lost.source})`,
    lost.quote,
    '',
    note ? `## The human's note on the decision\n\n${note}\n` : '',
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

// THE FLOW COMPOSER's two paths (Task 5; D4 amended 2026-08-21 #2 by the human). Both re-derive the
// library from the tree at request time (behavior blocks + tests only) and re-run the pure check —
// the client's button is a rendering of this answer, never the authority.
//   composeFlow — DETERMINISTIC: every chained beat a function-shaped, currently-passing step; the
//     emitter composes the flow file (imports · coverReqs · the fixture Given · each beat call inside
//     its checkReq, state threaded) and the server writes/appends spec/<start>/test.spec.ts. No model.
//     The file is ordinary authored-test material from the moment it is written; nothing is composed
//     at suite runtime and no graph is stored. `dryRun` returns exactly what WOULD be written, without
//     writing — the suite proves the path without editing its own running spec file.
//   startComposeJob — the CLAUDE path: the prompt goes to the SAME detached claude runner scan and
//     rewrite use (runJob: a signed-in `claude`, its own process group so Cancel kills the tree,
//     diagnose() naming an expired login). "changed" asks the DISK whether a test with that title
//     landed (flowLanded), never the exit code.
function composeLibrary () { return deriveLibrary(allScreens()) }
function composeFlow ({ chain, name, dryRun }) {
  const { nodes, givens } = composeLibrary()
  const start = chain && chain.length && nodes.find(n => n.id === chain[0])
  const file = start ? join(SPEC, start.screen, 'test.spec.ts') : null
  const existing = file && existsSync(file) ? readFileSync(file, 'utf8') : null
  const chk = composeCheck({ nodes, givens, chain, name, existing })
  if (!chk.ok) throw new Error(chk.error)
  const out = emitFlow({ nodes, givens, chain, name, existing })
  if (!dryRun) {
    // never write the file a live run is executing (m3): the fold would arrive stale. A dry run
    // writes nothing, so it is answered whatever holds the slot (the suite proves the path that way).
    const blocker = composeBlockedBy(running, runStack, chk.start)
    if (blocker) {
      throw new Error(blocker.kind === 'compose'
        ? `a compose job is already writing spec/${chk.start}/test.spec.ts — compose after it closes`
        : `a run is in progress on ${blocker.screen === 'all' ? 'the whole suite' : 'spec/' + blocker.screen} — compose after it closes, or its fold would land stale`)
    }
    writeFileSync(join(ROOT, out.path), out.text)
    try { build() } catch (err) { console.error(String(err.stderr || err)) }
    notify()
  }
  return { path: out.path, testTitle: out.testTitle, covers: out.covers, start: out.start, dryRun: !!dryRun, text: out.text }
}
function startComposeJob ({ chain, name }) {
  const { nodes, givens } = composeLibrary()
  const c = Array.isArray(chain) ? chain : []
  if (!c.length) { const e = new Error('chain at least one beat first'); e.status = 400; throw e }
  for (const id of c) if (!nodes.find(n => n.id === id)) { const e = new Error(`no such beat: ${id}`); e.status = 400; throw e }
  const title = String(name || '').trim()
  if (!title) { const e = new Error('name the flow first'); e.status = 400; throw e }
  // the title lands in the prompt and is flowLanded's oracle — one printable line only (B-2)
  if (!validFlowName(title)) { const e = new Error('the flow name must be one line of printable text, at most 200 characters'); e.status = 400; throw e }
  const start = nodes.find(n => n.id === c[0]).screen
  const file = join(SPEC, start, 'test.spec.ts')
  runJob({
    kind: 'compose',
    label: start,
    prompt: composePrompt({ nodes, givens, chain: c, name: title }),
    failNote: `no test named "${title}" landed in spec/${start}/test.spec.ts`,
    changed: () => existsSync(file) && flowLanded(readFileSync(file, 'utf8'), title),
    onDone: () => `"${title}" landed in spec/${start}/test.spec.ts — run it and the flow folds in`
  })
  return { started: true, start, file: `spec/${start}/test.spec.ts`, testTitle: title }
}

// The crawl: an INVENTORY, nothing more. tools/crawl.mjs drives a real browser over the project's
// own app, screenshotting each route (crawl.png) and writing the manifest — each NEW route lands as
// a row with NO PRD, visibly ungoverned. It deliberately drafts neither requirements nor tests: a
// guessed requirement records the implementation's bugs as intent, and a shallow auto-test is a
// false green — depth is a per-screen, human-gated kg-deep pass (2026-07-31, the human's call; the
// old phase-2/3 Claude drafting was removed for exactly that reason). No claude login needed —
// the whole job is deterministic browser work. Rerunning touches nothing settled.

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
    if (running && running.cancelled) { finishCrawl(started, false, 'cancelled — partial inventory left in place'); return }
    const manifest = readCrawl()
    if (!manifest.routes.length) {
      // greenfield: nothing found, and that is a valid, complete answer
      finishCrawl(started, true, 'nothing found — greenfield: write the first PRD')
      return
    }
    // The inventory IS the result: every new route is a row with no PRD — honestly ungoverned.
    // Depth (requirements + proving flows) is a per-screen kg-deep pass, the human's to sponsor.
    const fresh = manifest.routes.filter(r => !r.exists).length
    finishCrawl(started, true, fresh
      ? `inventoried ${manifest.routes.length} route(s) · ${fresh} new row(s) with no PRD yet — run kg-deep on a screen to make it deep`
      : `inventoried ${manifest.routes.length} route(s), all already on the board`)
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
  // R4: the slot is global. A request that NAMES a parent is a run asking to NEST — the run already
  // holding the slot proving the run panel by starting a run of its own; without it the dispatch row
  // is the one row the board cannot run (it would wait for the slot its own run holds — the blank
  // browser hang). A request with NO parent is a person's second job: it does not queue and is no
  // longer refused — it TAKES OVER, cancelling the run in the slot and taking its place.
  if (running) {
    const parent = String(opts.parent || '')
    if (parent) {
      // A named request is only ever a nest attempt. Nest if it names the current holder and the
      // chain is still short enough (bounded so a suite that runs itself cannot recurse); otherwise
      // REFUSE — a mis-named or too-deep nest must fail loudly, never take over a run it might be
      // running inside.
      const mayNest = parent === running.runId && runStack.length < 2
      if (!mayNest) throw new Error('a run is already in progress')
      runStack.push(running)
    } else if (running.kind === 'tests') {
      // A person's second run takes over the run in the slot (cancel-and-run).
      takeover()
    } else {
      // The slot is held by an agent job (a redraft, a scan, a crawl). Those run for minutes, so a
      // stray Run must not discard them — refused, with the panel telling you to Cancel it first.
      throw new Error('a job is already in progress')
    }
  }
  const args = ['playwright', 'test', '--config=playwright.board.ts']
  // the only interpolated value, and it is checked against real directories before it is used
  if (screen) args.push(join('spec', screen, 'test.spec.ts'))
  // ONE test, not the whole file. Passed as its own argv entry, never interpolated into a shell
  // string, so a title with quotes or spaces in it cannot become anything but a grep pattern.
  const grep = String(opts.grep || '').trim()
  // -g is a REGEX; the board passes a literal test title, so escape it or a title with a paren or
  // bracket becomes a pattern that misses its own text and the run finds no test (dispatch R8).
  if (grep) args.push('-g', reEscape(grep))
  // Headed: the browser opens and you watch the test drive the app. This is what "watch it run"
  // means to a person — the file-watcher that re-runs on save is a different feature entirely.
  if (opts.headed) args.push('--headed')
  // The one Setup pace ("Pace of a watchable run") drives BOTH ways of watching, so the slider you
  // set means the same thing whether you watch it live or watch the recording back:
  //   • a HEADED run is paced live by Playwright's slowMo (a delay before each action);
  //   • a HEADLESS RECORDING reads the same value as BOARD_STEP_DELAY_MS and holds that long on each
  //     narrated beat (spec/_base.ts), so the burned-in numbers are readable on playback.
  const cfg = readConfig()
  const pace = cfg.stepDelayMs
  const slowMo = opts.headed ? pace : 0

  const started = Date.now()
  // The RECORD of this run: every screenshot and video Playwright captures while it drives the
  // app, kept per run so "what did the test actually see" is answerable afterwards rather than
  // only while you happened to be watching. Lives under spec/ because that is the only tree the
  // static server will serve.
  const runId = String(started)
  const recordDir = join(RUNDIR, runId)
  mkdirSync(recordDir, { recursive: true })
  // VOICE-OVER (init R6 / board R10). A single watchable flow (a named test on a screen) whose screen
  // has a narration pack, when the switch is on and ffmpeg is here to mux. Decided up front so the run
  // is PACED to the voice (BOARD_NARRATION_PACE) and logs its beats (BOARD_BEAT_LOG) — sync by
  // construction. The pace step SYNTHESIZES the lines (piper), so a box with no piper or no voice model
  // degrades HERE to a silent recording, honestly and loudly, rather than failing the run.
  const packFile = narrationPack(screen)
  const paceFile = join(recordDir, 'pace.json')
  const beatsFile = join(recordDir, 'beats.jsonl')
  let voice = shouldVoice({ voiceOver: cfg.voiceOver, screen, grep, packExists: existsSync(packFile), ffmpeg: ffmpegOk() })
  if (voice) {
    try {
      execFileSync(process.execPath, [join(ROOT, 'tools/narrate-run.mjs'), 'pace', '--pack', packFile, '--out', paceFile],
        { cwd: ROOT, stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } })
    } catch (err) {
      voice = false
      push('run', { state: 'line', line: 'voice-over is on, but the narration could not be synthesized (piper / voice model?) — recording silent' })
    }
  }
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
      // the configured pace, for a RECORDING's per-beat hold (read by spec/_base.ts). Always passed,
      // so "Pace of a watchable run" governs the video the same way slowMo governs a live watch.
      BOARD_STEP_DELAY_MS: String(pace),
      // Pin the run to THIS board's own port so it can NEVER spin up a second board on the hardcoded
      // 4173 default — the throwaway that collides with another scaffolded project's live board.
      // And for an ATTACH project (its app already runs at cfg.baseUrl), hand the run that URL so it
      // drives the live app and starts NO board of its own (playwright.board.ts starts no webServer
      // when BOARD_URL is set). A self-test project with no app still gets its board, but on PORT —
      // which reuseExistingServer then reuses rather than binding a fresh one.
      BOARD_PORT: String(PORT),
      ...(cfg.baseUrl && cfg.mode === 'attach' ? { BOARD_URL: cfg.baseUrl } : {}),
      ...(slowMo ? { BOARD_SLOWMO: String(slowMo) } : {}),
      // voice-over: hold each beat until its narrated line has been spoken (BOARD_NARRATION_PACE) and
      // log the run's beat timeline (BOARD_BEAT_LOG) so render can lay the audio at the beat times.
      // Both only when the run is actually being voiced — otherwise this is exactly a silent run.
      ...(voice ? { BOARD_NARRATION_PACE: paceFile, BOARD_BEAT_LOG: beatsFile } : {}),
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
  const myJob = (running = { screen: myScreen, started, child, kind: 'tests', runId })
  // runId travels with the start event so a page can tell its OWN run from one that took over: a
  // superseded run's 'done' arriving after the replacement started must not flip the live panel.
  push('run', { state: 'started', screen: myScreen, runId })

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
    // takes it away with everything else the run produced. FORCE_COLOR=0 already keeps it clean. A
    // board-started run has one; a CLI run (npm run e2e) has no record dir and so none — the entry
    // says which, so the board only offers the "whole run log" link when there is a file behind it.
    let hasLog = false
    try { writeFileSync(join(recordDir, 'run.log'), log.replace(/\x1b\[[0-9;]*m/g, '')); hasLog = true } catch { /* best effort: a missing log never fails a run */ }
    let shotsByTest = collectRecord(recordDir)
    // Cut the proof frames (board R14) from this run's recordings BEFORE archiving, so the git/bucket
    // ship carries them too. Best-effort: no ffmpeg or a failed cut just leaves a test without a strip.
    try { await extractProofFrames(recordDir, shotsByTest) } catch (err) { console.error('proof-frame cut failed:', err) }
    // Voice-over: mux the narration onto this run's recording, producing a voiced mp4 the player
    // prefers. BEFORE archiving, so a git ship carries it too. Best-effort: a render failure leaves
    // the silent recording untouched and says so on the run — never a failed run (board R10 rule 3).
    if (voice) {
      try {
        const voiced = renderVoiced(shotsByTest, beatsFile, packFile)
        if (voiced) push('run', { state: 'line', line: 'voiced the recording — ' + voiced })
      } catch (err) {
        push('run', { state: 'line', line: 'voice render failed — recording left silent: ' + (err.message || err) })
      }
    }
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
    // A run that matched no case proved nothing — never a green. runVerdict decides ok (a clean exit
    // AND at least one case) and attaches the honest "no tests ran" line so the panel and the run log
    // say what happened instead of "0 of 0 passing", which reads as success.
    const verdict = runVerdict(code, totals.total)
    const entry = {
      at: new Date(started).toISOString(),
      screen: myScreen,
      // WHICH case, when the run was scoped to one. "board 1/1" twice over says nothing about which
      // two tests those were, and a run log you cannot read back is a run log nobody consults.
      grep: grep || null,
      ms: Date.now() - started,
      ...totals,
      ok: verdict.ok,
      note: verdict.note,
      runId,
      // whether spec/_runs/<runId>/run.log exists — so the board offers the whole-log link only when
      // there is a file behind it (a CLI run has none).
      hasLog,
      // what each test SAW, keyed by title — the record is only useful if it can be looked at,
      // and only trustworthy if you can tell which test it belongs to
      shotsByTest,
      archive
    }
    recordRun(entry)
    // Release through the ONE slot rule, naming OURSELVES (myJob, the captured local — never the
    // global, which may already be the run that took us over). A nested run finishing hands the
    // slot back to the run it was nested in; a run that was TAKEN OVER (R4) is no longer the
    // holder and must not touch the slot — popping unconditionally here freed the takeover run's
    // slot the moment the superseded run's process died, and a person could start a second run
    // alongside the live one: the exact thing the slot exists to refuse.
    releaseSlot(myJob)
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
  // (task-5 review B-2 re-checked this guard: it sits BEFORE every POST handler, the compose ones
  // included, and a browser always sends Origin on a cross-site POST — text/plain "simple" requests
  // too. A board served on a hostname other than localhost accepts its OWN origin only when that
  // hostname is named in BOARD_HOST: matching the Origin against the request's Host alone would
  // let a DNS-rebound page — evil.example resolving to this machine — match its own Host (the
  // re-review's one new finding). Loopback forms of this port are always the board's own.)
  const origin = req.headers.origin
  const host = String(req.headers.host || '')
  const ownHost = host && process.env.BOARD_HOST && host === `${process.env.BOARD_HOST}:${PORT}`
  const sameOrigin = !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}` ||
    origin === `http://[::1]:${PORT}` ||
    (ownHost && (origin === `http://${host}` || origin === `https://${host}`))
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

  // A job you cannot stop is a job you have to wait out. A scan or crawl takes minutes, and noticing
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

  // Recording a decision is instant and always allowed — it is the human's answer, and it must not
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

  // the composer's deterministic path — 409 carries the honest refusal (a gap, an inline beat, a
  // missing name, a duplicate title); 200 names the written file (or, dryRun, what would be written)
  if (url.pathname === '/api/compose' && req.method === 'POST') {
    try {
      const out = composeFlow(JSON.parse(await readBody(req) || '{}'))
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out))
    } catch (err) {
      res.writeHead(409, { 'content-type': 'text/plain' }); res.end(err.message)
    }
    return
  }
  // the composer's Claude path — 400 for a malformed ask (nothing spawns), 409 when the one job slot
  // is taken (runJob's guard, shared with scan/rewrite)
  if (url.pathname === '/api/compose-job' && req.method === 'POST') {
    try {
      const out = startComposeJob(JSON.parse(await readBody(req) || '{}'))
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out))
    } catch (err) {
      res.writeHead(err.status || 409, { 'content-type': 'text/plain' }); res.end(err.message)
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
      runs: decorateRuns(readRuns()),
      running: running ? running.screen : null,
      runningId: running ? running.runId : null,
      watch: watchOn
    }))
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

  // Whether this box can voice a watchable run (init R6) — probed live so Setup can disable the switch
  // until piper + ffmpeg + a voice model are all present, and a Re-check re-probes without a restart.
  // JSON only, like the other status endpoints — safe before the static allowlist without widening it.
  if (url.pathname === '/api/voice-status') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(voiceStatus()))
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
  // A direct state.json write (a test, a second tool) never triggers the watcher; rebuild before we
  // serve so the board a reload sees reflects the current pins, not a version from before them.
  if (rel === 'board.html' && boardStaleAgainstState()) {
    try { build() } catch (err) { console.error(String(err.stderr || err)) }
  }
  const file = join(ROOT, rel)
  if (!allowed || !file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return
  }
  const body = readFileSync(file)
  const type = TYPES[extname(file)] || 'application/octet-stream'
  // A COMMITTED .html UNDER spec/** IS A REPLICA — the app's own DOM as it was (`.actual.html`) or
  // as the requirement says it should have been (`.expected.html`, phase 2, 2026-09-03). Either way it is
  // sanitised at capture (spec/_replica.mjs: no script, no handler, no external URL) and the board
  // will only ever show it inside an <iframe sandbox srcdoc>; this header is the third wall, so a
  // replica opened DIRECTLY in a tab is inert too — no script, no fetch, no network font, no
  // same-origin identity at all. board.html is not under spec/ and is untouched.
  const csp = rel.startsWith('spec/') && rel.endsWith('.html')
    ? { 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'self' data:" }
    : {}
  // BYTE-RANGE support. The run recordings are MediaRecorder .webm files, which carry no duration
  // header — a <video> timeline can only become seekable once the browser probes the file's end,
  // and it probes with Range requests. Without 206 partials the player shows an unscrubbable
  // timeline. Ranges are honoured for every static file; video is the consumer that needs it.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (range && (range[1] !== '' || range[2] !== '')) {
    const size = body.length
    const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1])
    const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': 'bytes */' + size }); res.end(); return
    }
    res.writeHead(206, {
      'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes',
      'content-range': 'bytes ' + start + '-' + end + '/' + size, 'content-length': end - start + 1,
      ...csp
    })
    res.end(body.subarray(start, end + 1))
    return
  }
  res.writeHead(200, {
    'content-type': type, 'cache-control': 'no-store',
    'accept-ranges': 'bytes', 'content-length': body.length,
    ...csp
  })
  res.end(body)
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
// RECURSIVE, AND OVER A TREE THAT COMES AND GOES. A run creates and deletes screen directories under
// spec/ (the _modes probes, the state guard's cleanup), and on Linux the recursive walker raises
// `ENOENT … scandir` on the FSWatcher when one vanishes underneath it. watchDir handles that error,
// closes the dead watcher and re-arms on spec/ — the watch survives a probe directory's whole
// lifecycle instead of taking the server down with it (CI run 33294053726).
watchDir(SPEC, { recursive: true }, (_e, name) => {
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
watchDir(join(ROOT, 'tools'), {}, (_e, name) => {
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
