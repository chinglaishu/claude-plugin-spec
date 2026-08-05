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
  // What counts as an import, and what does NOT. A blunt scan for a quoted './…' reads three things
  // that are not dependencies: an example inside a comment (spec/_seed.ts), an import inside a STRING
  // that writes a generated spec file (spec/_fixture.ts), and resolve(…, '..') (tools/spec-store.mjs).
  // So: statements are anchored to the start of a line and must carry `from`, and dynamic imports —
  // spec/_state-guard.ts loads ./_seed.ts that way, mid-line — are matched only after line comments
  // are stripped.
  const PATTERNS = [
    /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s*['"](\.[^'"]+)['"]/gm,  // import/export … from './x'
    /^\s*import\s+['"](\.[^'"]+)['"]/gm,                              // side-effect import './x'
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g                        // await import('./x')
  ]
  const missing = []
  for (const rel of FILES.filter(f => /\.(mjs|ts)$/.test(f))) {
    const src = readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    for (const pattern of PATTERNS) {
      for (const m of src.matchAll(pattern)) {
        const dep = join(dirname(rel), m[1])
        if (!vendored(dep)) missing.push(rel + ' -> ' + m[1])
      }
    }
  }
  assert.deepEqual(missing, [], 'imported but not vendored')
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
