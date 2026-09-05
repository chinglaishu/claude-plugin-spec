// Put specboard into a project. The tools resolve their root to the repo they live in, so the way
// to run the board on YOUR code is to vendor the skeleton into your repo — then `npm run board`
// there reads your spec/, writes your board.html, and runs your tests, with no path juggling.
//
//   node <plugin>/tools/scaffold.mjs [appRepo]                  → <appRepo>/specboard/  (THE RULE: COMMITTED
//                                                                 into the app repo — authored files only; the
//                                                                 folder's own .gitignore keeps the vendored
//                                                                 code out, and everything a run derives lives
//                                                                 in ~/.specboard/<projectId>/)
//   node <plugin>/tools/scaffold.mjs [appRepo] --dir <boardDir>  → anywhere else; the app repo gets a one-line
//                                                                 .specboard pointer
//   node <plugin>/tools/scaffold.mjs [appRepo] --flat            → the old vendored-in layout
//
// It copies the tools and the shared test harness, the ONE design system, and the run scripts, and
// it never overwrites a file you already have (so re-running to pull an update is safe with --force,
// and safe without it too — it just skips what exists). It does NOT copy specboard's own screens;
// your screens are yours to crawl or write.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createServer } from 'node:net'
import { FILES, SCRIPTS, DEV, DEPS, MANIFEST, POINTER, NESTED, SPEC_IGNORE, ROOT_IGNORE, boardIgnoreLines, buildManifest, mergeManifest, newProjectId, resolveProject } from './_skeleton.mjs'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const force = args.includes('--force')
// THE RULE (2026-09-04, flipped 2026-09-06): the positional argument is the APP REPO (default: the
// current directory) and the board goes into `<appRepo>/specboard/` — a folder the app repo COMMITS,
// holding the authored spec and nothing else. The vendored code and the generated board are ignored
// by the folder's own .gitignore, and everything a run derives lives in ~/.specboard/<projectId>/,
// out of every git by location — which is what made ignoring the whole folder unnecessary, and what
// takes a project's PRDs and tests off a single disk. Two escapes: `--dir <boardDir>` puts the board
// anywhere else (the app repo then gets the one-line `.specboard` pointer, since the folder name no longer finds it), and
// `--flat` is the old vendored-in layout (the board's files straight into the app repo). A repo that
// already has a board (nested, pointed-to, or flat) is re-scaffolded IN PLACE — never given a second.
const dirIdx = args.indexOf('--dir')
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir')
const APP = resolve(positional[0] || process.cwd())
const existing = resolveProject(APP)
const flat = args.includes('--flat')
const DEST = dirIdx >= 0 ? resolve(args[dirIdx + 1])
  : existing !== APP ? existing              // already has a board somewhere — update that one
    : flat || existsSync(join(APP, MANIFEST)) ? APP   // asked for flat, or already flat
      : join(APP, NESTED)                    // the rule
const NESTED_HERE = DEST === join(APP, NESTED)

if (DEST === SRC) {
  console.error('Refusing to scaffold specboard onto itself. Give a target project directory.')
  process.exit(1)
}

// The skeleton (FILES), the run scripts (SCRIPTS) and the dev deps (DEV) live in _skeleton.mjs, the
// one list update.mjs also reads — so scaffold and update can never disagree about what a project is
// made of. NOT spec/<screen>/ — those are the target's own screens.

const copied = []; const skipped = []
for (const rel of FILES) {
  const from = join(SRC, rel); const to = join(DEST, rel)
  if (!existsSync(from)) continue
  if (existsSync(to) && !force) { skipped.push(rel); continue }
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
  copied.push(rel)
}

// spec/.gitignore — the transient run state AND everything a run derives (the data home, decision A
// 2026-09-05: the harvest, the fold, the run log and the raw report live in ~/.specboard/<projectId>/,
// so git keeps only what a person wrote). NOT _specboard.json (the release, the project id and the
// two store switches) and NOT _conflict-decisions.json (the human's rulings). The backup dirs and
// .new files an update leaves behind ARE transient merge scratch, so they are ignored.
const gi = join(DEST, 'spec/.gitignore')
if (!existsSync(gi) || force) {
  writeFileSync(gi, [...SPEC_IGNORE, ''].join('\n'))
  copied.push('spec/.gitignore')
}
// Ignores. FLAT: the app repo's .gitignore gets the update scratch (a backup dir and .new files live
// at the paths they shadow). NESTED / --dir: the board folder gets its OWN .gitignore, which hides
// the folder's MACHINERY — the vendored skeleton, board.html, node_modules, the scratch, the saved
// session — and nothing a person wrote. The app repo's .gitignore is NOT touched any more
// (2026-09-06): the folder is COMMITTED, because with the harvest gone to the data home what is left
// inside it is the authored board, and ignoring that kept a project's PRDs and tests on one disk.
const appendIgnore = (file, lines, header) => {
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const missing = lines.filter(p => !cur.split('\n').map(l => l.trim()).includes(p))
  if (!missing.length) return
  writeFileSync(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + (header ? header + '\n' : '') + missing.join('\n') + '\n')
}
if (DEST === APP) {
  appendIgnore(join(APP, '.gitignore'), ROOT_IGNORE, '# specboard update scratch')
} else {
  appendIgnore(join(DEST, '.gitignore'), boardIgnoreLines(), `# specboard — the board for ${relative(DEST, APP) || '.'}: its VENDORED code and its generated board are ignored here; the authored spec beside them is committed`)
}

// The version manifest — the base-of-record update.mjs compares against. Written on every scaffold
// (and --force re-vendor), so a freshly scaffolded project is immediately update-ready. Records the
// hashes of the files AS SHIPPED, which is exactly what buildManifest(SRC) computes.
if (!existsSync(join(DEST, MANIFEST)) || force) {
  // --force keeps the project's committed identity (`project: { name, tagline }`) — A-2
  let prev = null
  try { prev = JSON.parse(readFileSync(join(DEST, MANIFEST), 'utf8')) } catch { prev = null }
  const fresh = mergeManifest(buildManifest(SRC), prev)
  if (DEST !== APP) fresh.app = relative(DEST, APP) || '.'
  // WHERE THIS PROJECT'S DERIVED DATA LIVES (the data home, 2026-09-06). Written once and committed:
  // `projectId` names ~/.specboard/<projectId>/ on every machine that checks the project out, and the
  // two switches start LOCAL — a board.db file and a blobs/ directory, nothing to install, nothing to
  // sign up for. A team flips `db` to "remote" and `media` to "cloud" (adding `bucket`) later, and
  // that flip IS the migration; mergeManifest then carries all of it across every update.
  if (!fresh.projectId) fresh.projectId = newProjectId((fresh.project && fresh.project.name) || basename(APP))
  if (!fresh.db) fresh.db = 'local'
  if (!fresh.media) fresh.media = 'local'
  writeFileSync(join(DEST, MANIFEST), JSON.stringify(fresh, null, 2) + '\n')
  copied.push(MANIFEST)
}
// The sidecar's pointer in the app repo — one relative line, committed there, so every skill and
// update run from the app repo finds this board. Never overwrites a pointer that already exists.
if (DEST !== APP && !NESTED_HERE) {
  const ptr = join(APP, POINTER)
  if (!existsSync(ptr) || force) { writeFileSync(ptr, relative(APP, DEST) + '\n'); copied.push(relative(DEST, ptr)) }
}

// THIS PROJECT'S OWN BOARD PORT. Every scaffolded project used to default to 4173, so two projects
// on one machine collided the moment both boards (or a board and a test run's throwaway) were up.
// Each scaffold now assigns the project a port of its own and bakes it into the `board` script as
// `--port <n>`; a machine-level registry (~/.specboard-ports.json) remembers every assignment so the
// next project scaffolded skips taken ports even while no board is running. Re-scaffolding the same
// project keeps its port. BOARD_PORT / PORT env still override at runtime.
const REGISTRY = join(homedir(), '.specboard-ports.json')
const reg = (() => { try { return JSON.parse(readFileSync(REGISTRY, 'utf8')) } catch { return {} } })()
const bindable = p => new Promise(ok => {
  const s = createServer()
  s.once('error', () => ok(false))
  s.listen(p, '127.0.0.1', () => s.close(() => ok(true)))
})
let boardPort = reg[DEST]
if (!boardPort) {
  const taken = new Set(Object.values(reg))
  for (let p = 4173; p < 4273; p++) {
    if (taken.has(p)) continue
    if (await bindable(p)) { boardPort = p; break }
  }
  boardPort = boardPort || 4173 // 100 straight failures means something else is wrong; keep the old default
  reg[DEST] = boardPort
  try { writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n') } catch { /* registry is best-effort */ }
}

// package.json — add the run scripts and the two dev deps without disturbing what is already there.
// SCRIPTS and DEV come from _skeleton.mjs.
const pkgPath = join(DEST, 'package.json')
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: 'my-specboard', private: true }
if (!pkg.type) pkg.type = 'module'
pkg.scripts = { ...SCRIPTS, ...(pkg.scripts || {}) } // yours win — never clobber a script you rely on
// Stamp the assigned port into the board script — but never rewrite a board script the project
// customised (only the pristine skeleton default gets the stamp).
if (!pkg.scripts.board || pkg.scripts.board === SCRIPTS.board) {
  pkg.scripts.board = `${SCRIPTS.board} --port ${boardPort}`
}
pkg.devDependencies = { ...(pkg.devDependencies || {}), ...DEV }
// …and the store's two drivers as real dependencies (the data home, 2026-09-06): the board SERVER
// opens board.db through better-sqlite3 (pg is the same interface pointed at a team's database), so
// a project vendored without them cannot render a single page of its own board.
pkg.dependencies = { ...(pkg.dependencies || {}), ...DEPS }
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Scaffolded specboard into ${DEST}${DEST !== APP ? `  (the board for ${APP}${NESTED_HERE ? ' — committed there, authored files only' : ''})` : ''}`)
if (NESTED_HERE) {
  console.log('  specboard/ is meant to be COMMITTED: its .gitignore keeps the vendored code, board.html and')
  console.log('  node_modules out, and every derived byte lives in ~/.specboard/<projectId>/. If your repo\'s')
  console.log('  .gitignore still has a "/specboard/" line from an earlier release, remove it to commit the board.')
}
console.log(`  ${copied.length} file(s) written${skipped.length ? `, ${skipped.length} left alone (already present — pass --force to overwrite)` : ''}`)
if (pkg.type !== 'module') console.log('  NOTE: your package.json is not "type":"module" — the tools are ESM.')
console.log(`  board port: ${boardPort} (this project's own — recorded in ~/.specboard-ports.json)`)
console.log('\nNext:')
if (DEST !== APP) console.log(`  cd ${DEST}`)
console.log('  npm install')
console.log(`  npm run board      # empty board — open http://localhost:${boardPort} and use Set up → Crawl`)
