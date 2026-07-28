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

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const force = args.includes('--force')
const DEST = resolve(args.find(a => !a.startsWith('--')) || process.cwd())

if (DEST === SRC) {
  console.error('Refusing to scaffold specboard onto itself. Give a target project directory.')
  process.exit(1)
}

// The skeleton: the tools, the shared test harness, the design system, the Playwright config. NOT
// spec/<screen>/ — those are the target's own screens.
const FILES = [
  'tools/spec-store.mjs', 'tools/build-board.mjs', 'tools/serve-board.mjs',
  'tools/crawl.mjs', 'tools/ship-record.mjs', 'tools/staff.mjs',
  'playwright.board.ts',
  'spec/_design.css', 'spec/_base.ts', 'spec/_fixture.ts',
  'spec/_state-guard.ts', 'spec/_state-guard-teardown.ts', 'spec/_results-reporter.mjs',
  // the optional auth setup — inert unless the target configures a signIn in spec/_config.json
  'spec/_auth.setup.ts'
]

const copied = []; const skipped = []
for (const rel of FILES) {
  const from = join(SRC, rel); const to = join(DEST, rel)
  if (!existsSync(from)) continue
  if (existsSync(to) && !force) { skipped.push(rel); continue }
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
  copied.push(rel)
}

// spec/.gitignore — the transient run state never belongs in git
const gi = join(DEST, 'spec/.gitignore')
if (!existsSync(gi) || force) {
  writeFileSync(gi, [
    '_state-snapshot.*.json', '_dir-snapshot.*.json', '_run-report.json', '_runs/',
    '_conflicts.json', '_conflict-decisions.json', '_config.json', '_crawl.json', 'crawl.png',
    // the saved authenticated session — real tokens, never committed
    '_auth-state.json', ''
  ].join('\n'))
  copied.push('spec/.gitignore')
}

// package.json — add the run scripts and the two dev deps without disturbing what is already there
const SCRIPTS = {
  board: 'node tools/serve-board.mjs',
  'board:build': 'node tools/build-board.mjs',
  staff: 'node tools/staff.mjs',
  e2e: 'playwright test --config=playwright.board.ts'
}
const DEV = { '@playwright/test': '^1.62.0', '@types/node': '^22.0.0' }
const pkgPath = join(DEST, 'package.json')
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: 'my-specboard', private: true }
if (!pkg.type) pkg.type = 'module'
pkg.scripts = { ...SCRIPTS, ...(pkg.scripts || {}) } // yours win — never clobber a script you rely on
pkg.devDependencies = { ...(pkg.devDependencies || {}), ...DEV }
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Scaffolded specboard into ${DEST}`)
console.log(`  ${copied.length} file(s) written${skipped.length ? `, ${skipped.length} left alone (already present — pass --force to overwrite)` : ''}`)
if (pkg.type !== 'module') console.log('  NOTE: your package.json is not "type":"module" — the tools are ESM.')
console.log('\nNext:')
console.log('  npm install')
console.log('  npm run board      # empty board — open http://localhost:4173 and use Set up → Crawl')
