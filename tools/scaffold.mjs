// Put specboard into a project. The tools resolve their root to the repo they live in, so the way
// to run the board on YOUR code is to vendor the skeleton into your repo — then `npm run board`
// there reads your spec/, writes your board.html, and runs your tests, with no path juggling.
//
//   node <plugin>/tools/scaffold.mjs [targetДir]   (defaults to the current directory)
//
// It copies the tools and the shared test harness, the ONE design system, and the run scripts, and
// it never overwrites a file you already have (so re-running to pull an update is safe with --force,
// and safe without it too — it just skips what exists). It does NOT copy specboard's own screens;
// your screens are yours to crawl or write.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createServer } from 'node:net'
import { FILES, SCRIPTS, DEV, MANIFEST, SPEC_IGNORE, ROOT_IGNORE, buildManifest, mergeManifest } from './_skeleton.mjs'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const force = args.includes('--force')
const DEST = resolve(args.find(a => !a.startsWith('--')) || process.cwd())

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

// spec/.gitignore — the transient run state never belongs in git. NOT _specboard.json: that is a
// committable record of which release the project runs. The backup dirs and .new files an update
// leaves behind ARE transient recovery/merge scratch, so they are ignored.
// Neither list touches spec/<screen>/evidence/ or board.html — the harvest is committed (D2).
const gi = join(DEST, 'spec/.gitignore')
if (!existsSync(gi) || force) {
  writeFileSync(gi, [...SPEC_IGNORE, ''].join('\n'))
  copied.push('spec/.gitignore')
}
// The repo-root .gitignore gets the update scratch (a backup dir and .new files live at the paths
// they shadow, anywhere in the tree). Appended, never clobbered.
const rootGi = join(DEST, '.gitignore')
const existing = existsSync(rootGi) ? readFileSync(rootGi, 'utf8') : ''
const missing = ROOT_IGNORE.filter(p => !existing.split('\n').includes(p))
if (missing.length) {
  writeFileSync(rootGi, existing + (existing && !existing.endsWith('\n') ? '\n' : '') +
    '# specboard update scratch\n' + missing.join('\n') + '\n')
}

// The version manifest — the base-of-record update.mjs compares against. Written on every scaffold
// (and --force re-vendor), so a freshly scaffolded project is immediately update-ready. Records the
// hashes of the files AS SHIPPED, which is exactly what buildManifest(SRC) computes.
if (!existsSync(join(DEST, MANIFEST)) || force) {
  // --force keeps the project's committed identity (`project: { name, tagline }`) — A-2
  let prev = null
  try { prev = JSON.parse(readFileSync(join(DEST, MANIFEST), 'utf8')) } catch { prev = null }
  writeFileSync(join(DEST, MANIFEST), JSON.stringify(mergeManifest(buildManifest(SRC), prev), null, 2) + '\n')
  copied.push(MANIFEST)
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
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Scaffolded specboard into ${DEST}`)
console.log(`  ${copied.length} file(s) written${skipped.length ? `, ${skipped.length} left alone (already present — pass --force to overwrite)` : ''}`)
if (pkg.type !== 'module') console.log('  NOTE: your package.json is not "type":"module" — the tools are ESM.')
console.log(`  board port: ${boardPort} (this project's own — recorded in ~/.specboard-ports.json)`)
console.log('\nNext:')
console.log('  npm install')
console.log(`  npm run board      # empty board — open http://localhost:${boardPort} and use Set up → Crawl`)
