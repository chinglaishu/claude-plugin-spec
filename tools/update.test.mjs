// The decision table of update.mjs is file-mutating, so it is proven, not trusted. Each test builds
// a throwaway project in ONE state, runs the update against a fixture "new" source, and asserts what
// happened on disk and in the report — assertions that fail if the table is wrong, not merely that
// the tool ran. (node --test; no board, no browser.)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { updateProject } from './update.mjs'
import { FILES } from './_skeleton.mjs'

const h = s => createHash('sha256').update(s).digest('hex')
const w = (root, rel, body) => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8')

// a fresh src (the "new release") + dest (the project). src carries a plugin.json so the tool can
// read the version it is updating TO.
function scratch (version = '9.9.9') {
  const box = mkdtempSync(join(tmpdir(), 'kgu-'))
  const src = join(box, 'src'); const dest = join(box, 'dest')
  mkdirSync(src); mkdirSync(dest)
  w(src, '.claude-plugin/plugin.json', JSON.stringify({ name: 'specboard', version }))
  return { src, dest }
}
const manifest = (dest) => JSON.parse(read(dest, 'spec/_specboard.json'))

test('unmodified from base → the file is updated and its manifest hash bumped', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW')
  w(dest, 'a.mjs', 'OLD')
  const base = { version: '1.0.0', files: { 'a.mjs': h('OLD') } }
  const rep = updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.deepEqual(rep.updated, ['a.mjs'])
  assert.equal(read(dest, 'a.mjs'), 'NEW')
  assert.equal(manifest(dest).files['a.mjs'], h('NEW'))
  assert.equal(manifest(dest).version, '9.9.9')
})

test('locally edited AND changed upstream → conflict: yours kept, .new written, version NOT bumped', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW')
  w(dest, 'a.mjs', 'EDITED')
  const base = { version: '1.0.0', files: { 'a.mjs': h('BASE') } }
  const rep = updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.deepEqual(rep.conflicts.map(c => c.file), ['a.mjs'])
  assert.equal(read(dest, 'a.mjs'), 'EDITED', 'your file is left untouched')
  assert.equal(read(dest, 'a.mjs.new'), 'NEW', 'the incoming version is written alongside')
  assert.equal(manifest(dest).files['a.mjs'], h('BASE'), 'the file is still on its old base')
  assert.equal(manifest(dest).version, '1.0.0', 'version does not claim the new release while a conflict stands')
  assert.equal(rep.hasConflicts, true)
})

test('already up to date → nothing is written, no .new', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW')
  w(dest, 'a.mjs', 'NEW')
  const base = { version: '1.0.0', files: { 'a.mjs': h('OLD') } }
  const rep = updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.deepEqual(rep.upToDate, ['a.mjs'])
  assert.equal(existsSync(join(dest, 'a.mjs.new')), false)
  assert.equal(read(dest, 'a.mjs'), 'NEW')
})

test('unchanged upstream but locally edited → skipped, your edit preserved, no .new', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'BASE')            // src == base: the file did not change this release
  w(dest, 'a.mjs', 'EDITED')
  const base = { version: '1.0.0', files: { 'a.mjs': h('BASE') } }
  const rep = updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.deepEqual(rep.skipped, ['a.mjs'])
  assert.equal(read(dest, 'a.mjs'), 'EDITED', 'a local edit to an unchanged file is left alone')
  assert.equal(existsSync(join(dest, 'a.mjs.new')), false)
})

test('missing file → added', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW')
  const base = { version: '1.0.0', files: {} }
  const rep = updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.deepEqual(rep.added, ['a.mjs'])
  assert.equal(read(dest, 'a.mjs'), 'NEW')
  assert.equal(manifest(dest).files['a.mjs'], h('NEW'))
})

test('the golden-data seed template is part of the skeleton', () => {
  // Part 2 of the golden-data work depends on this: a project scaffolded before _seed.ts existed must
  // GAIN it on update, and it only can if the file is one of the tracked skeleton FILES. If this ever
  // regresses, `kg-update` would silently never deliver the seed hook and golden tests could not run.
  assert.ok(FILES.includes('spec/_seed.ts'), 'spec/_seed.ts must be a vendored skeleton file')
})

// (Deleted 2026-09-05 with the SKETCH it guarded — "the viz pass shell is part of the skeleton"
// pinned that tools/viz-derive.mjs stayed on the vendored FILES list, because it was a CLI entry
// point nothing vendored imports and so was invisible to the every-relative-import-is-vendored
// guard below. The human retired the sketch: there is no viz pass to give a scaffolded project
// hands to run, and the file is gone. tools/viz.mjs stays vendored on the guard's own terms —
// build-board, proof-integrity and spec/_base.ts all import it for `layoutHash`.)

// The relative-path specifiers a vendored file actually imports. Extracted so the meta-test below can
// pin that the detector SEES the multi-line brace form — a regression an earlier line-anchored rewrite
// introduced, because `[^'"\n]` can never span the newlines of
//     import {
//       ROOT, esc, ...
//     } from './spec-store.mjs'
// which is exactly how build-board.mjs and serve-board.mjs import spec-store. A blunt scan for a
// quoted './…' would over-read TWO things that are not dependencies: an example inside a comment
// (spec/_seed.ts) and an import inside a STRING that writes a generated spec file (spec/_fixture.ts).
// So: strip line comments first; require `from` for a statement (the `import.meta.url` on
// spec-store's ROOT line carries no `from`, so it is never mistaken for one); match the dynamic
// import() form spec/_state-guard.ts uses for ./_seed.ts; and dedup through a Set so the brace and
// single-line `from` patterns never double-report the same specifier.
const relImports = text => {
  const src = text.replace(/^\s*\/\/.*$/gm, '')
  const specs = new Set()
  const PATTERNS = [
    /^\s*import\s*\{[^}]*\}\s*from\s*['"](\.[^'"]+)['"]/gm,          // import { … } from './x'  (spans newlines; anchored so the in-string import in _fixture.ts, which has a quote before `import`, is not read)
    /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s*['"](\.[^'"]+)['"]/gm, // default / namespace / re-export from './x'
    /^\s*import\s+['"](\.[^'"]+)['"]/gm,                             // side-effect import './x'
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g                       // await import('./x')
  ]
  for (const p of PATTERNS) for (const m of src.matchAll(p)) specs.add(m[1])
  return [...specs]
}

test('every relative import of a vendored file is itself vendored', () => {
  // A tool the skeleton ships can only import files the skeleton also ships. The failure is invisible
  // HERE and fatal THERE: build-board.mjs importing an unvendored sibling throws ERR_MODULE_NOT_FOUND
  // on the project's first `npm run board:build`, and the board never renders again. This caught
  // exactly that for tools/journey.mjs the day it was added.
  // The .ts half matters just as much — spec/_state-guard.ts imports ./_seed, spec/_fixture.ts
  // imports ../tools/build-board.mjs — and those specifiers are extensionless, so a bare list check
  // would miss them. Accept the path as written or with a .ts/.mjs extension added.
  const vendored = dep => FILES.includes(dep) ||
    FILES.includes(dep + '.ts') || FILES.includes(dep + '.mjs') || FILES.includes(dep + '.js')
  const missing = []
  for (const rel of FILES.filter(f => /\.(mjs|ts)$/.test(f))) {
    const text = readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
    for (const spec of relImports(text)) {
      const dep = join(dirname(rel), spec)
      if (!vendored(dep)) missing.push(rel + ' -> ' + spec)
    }
  }
  assert.deepEqual(missing, [], 'imported but not vendored')
})

test('the vendoring guard sees the multi-line brace import form', () => {
  // The hole the guard above had, pinned so it cannot silently return. build-board.mjs imports
  // ./spec-store.mjs with a multi-line `import { … } from`, and a line-anchored `from` pattern never
  // spans those newlines — so the detector saw only ./journey.mjs. The guard STILL passed, because
  // other single-line importers kept spec-store in FILES; it would not have failed with spec-store
  // dropped from FILES for build-board, the very miss it exists to catch (rule 2). Assert the
  // detector actually resolves spec-store for this file.
  const src = readFileSync(new URL('../tools/build-board.mjs', import.meta.url), 'utf8')
  assert.ok(relImports(src).includes('./spec-store.mjs'),
    'the multi-line import of ./spec-store.mjs must be seen, not only ./journey.mjs')
})

// EVERY FILE build-board.mjs READS VERBATIM IS VENDORED (final review I7, 2026-09-04).
// tools/board/client.js, stepper.js and words.js are not *imported* by anything — they are read as
// text and inlined into board.html — so the every-relative-import-is-vendored guard above is
// structurally blind to all three: drop `tools/board/words.js` from FILES and every unit test still
// passes, while a scaffolded project's `npm run board:build` throws ENOENT and emits no board at
// all. Derived from build-board.mjs's own source rather than restated as a list here, so a FOURTH
// inlined file is pinned the day it is added and this test cannot drift from the builder.
const VERBATIM = /readFileSync\(join\(ROOT, *'tools', *'board', *'([A-Za-z0-9_.-]+)'\)/g
test('every file build-board.mjs inlines verbatim is a vendored skeleton file', () => {
  const src = readFileSync(new URL('../tools/build-board.mjs', import.meta.url), 'utf8')
  const inlined = [...src.matchAll(VERBATIM)].map(m => 'tools/board/' + m[1])
  assert.ok(inlined.length >= 3, 'the verbatim reads must still be findable in build-board.mjs, got ' + inlined.length)
  assert.deepEqual(inlined.filter(f => !FILES.includes(f)), [], 'inlined verbatim but not vendored')
})

test('every vendored skeleton file exists on disk', () => {
  // A FILES entry naming a file that is not there is a scaffold that half-lands and an update that
  // reports a file it never copied — invisible here until someone runs kg-init in another repo.
  const missing = FILES.filter(f => !existsSync(new URL('../' + f, import.meta.url)))
  assert.deepEqual(missing, [], 'listed in the skeleton but absent from the plugin')
})

test('a project without the seed template GAINS it on update (added)', () => {
  // The exact path a manifest-less older project takes: the new release carries spec/_seed.ts, the
  // project has none, so it is ADDED and recorded — the harness gains the seed hook.
  const { src, dest } = scratch()
  w(src, 'spec/_seed.ts', 'export default async function seed(){}')
  const base = { version: '1.0.0', files: {} }
  const rep = updateProject({ dest, src, base, files: ['spec/_seed.ts'] })
  assert.deepEqual(rep.added, ['spec/_seed.ts'])
  assert.ok(existsSync(join(dest, 'spec/_seed.ts')), 'the seed template lands in the project')
  assert.equal(manifest(dest).files['spec/_seed.ts'], h('export default async function seed(){}'))
})

test('a clean run (no conflicts) bumps the manifest version', () => {
  const { src, dest } = scratch('2.0.0')
  w(src, 'a.mjs', 'NEW'); w(dest, 'a.mjs', 'OLD')
  const base = { version: '1.0.0', files: { 'a.mjs': h('OLD') } }
  updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.equal(manifest(dest).version, '2.0.0')
})

test('dry run reports the plan but writes nothing', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW'); w(dest, 'a.mjs', 'OLD')
  const base = { version: '1.0.0', files: { 'a.mjs': h('OLD') } }
  const rep = updateProject({ dest, src, base, files: ['a.mjs'], dryRun: true })
  assert.deepEqual(rep.updated, ['a.mjs'])
  assert.equal(read(dest, 'a.mjs'), 'OLD', 'the file is not touched on a dry run')
  assert.equal(existsSync(join(dest, 'spec/_specboard.json')), false, 'no manifest written on a dry run')
})

test('an overwrite is backed up first, under the base version', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW'); w(dest, 'a.mjs', 'OLD')
  const base = { version: '1.2.3', files: { 'a.mjs': h('OLD') } }
  updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.equal(read(dest, '.specboard-backup-1.2.3/a.mjs'), 'OLD', 'the replaced file is recoverable')
})

// Task 8 fix round 1 (A-2): the manifest's committed PROJECT IDENTITY — `project: { name, tagline }`,
// the crumb's authored source (spec/_config.json is gitignored on a scaffolded project, so a tagline
// there vanishes on a clone) — must survive an update: the manifest is rewritten with the new
// hashes, and the block rides along untouched.
test('project { name, tagline } in the manifest survives an update', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW')
  w(dest, 'a.mjs', 'OLD')
  const base = { version: '1.0.0', files: { 'a.mjs': h('OLD') }, project: { name: 'Tsumiki', tagline: 'task-tracker demo' } }
  updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.deepEqual(manifest(dest).project, { name: 'Tsumiki', tagline: 'task-tracker demo' })
  assert.equal(manifest(dest).version, '9.9.9')
})
test('a manifest without a project block gains none — nothing invented', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW'); w(dest, 'a.mjs', 'OLD')
  updateProject({ dest, src, base: { version: '1.0.0', files: { 'a.mjs': h('OLD') } }, files: ['a.mjs'] })
  assert.equal('project' in manifest(dest), false)
})

// The data home, 2026-09-06: `projectId` NAMES the project's data home, and `db`/`media` say which
// store it is. An update that dropped or reset any of the three would silently move a team's record
// to a different place — so they ride across exactly like `project` does.
test('projectId, db and media survive an update', () => {
  const { src, dest } = scratch()
  w(src, 'a.mjs', 'NEW'); w(dest, 'a.mjs', 'OLD')
  const base = { version: '1.0.0', files: { 'a.mjs': h('OLD') }, projectId: 'tsumiki-3f9a1c', db: 'remote', media: 'cloud' }
  updateProject({ dest, src, base, files: ['a.mjs'] })
  assert.equal(manifest(dest).projectId, 'tsumiki-3f9a1c')
  assert.equal(manifest(dest).db, 'remote')
  assert.equal(manifest(dest).media, 'cloud')
})
