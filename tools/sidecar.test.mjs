// tools/sidecar.test.mjs — the SIDECAR layout (the human, 2026-09-04: "put all specboard related
// file and image out of the dojostack_main repo … and make it still work"). A project may keep its
// whole board — spec/, the vendored tools/, board.html, playwright.board.ts, node_modules — in a
// directory BESIDE the app repo, so the app repo carries none of the harvest. Two facts tie the two
// together and both are proven here: the app repo's one-line `.specboard` pointer (how a skill or
// `update.mjs .` run from the app repo finds the board), and the manifest's `app` path (how the
// board finds the app repo back — for the project's own seed/auth helpers and its .claude/ skills).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { resolveProject, appRoot, mergeManifest, POINTER, MANIFEST } from './_skeleton.mjs'

const w = (root, rel, body) => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}
const box = () => realpathSync(mkdtempSync(join(tmpdir(), 'kgs-')))

test('the pointer file is named .specboard and holds one relative path', () => {
  assert.equal(POINTER, '.specboard')
})

test('resolveProject: a directory that IS a scaffolded project resolves to itself', () => {
  const b = box()
  w(b, MANIFEST, '{}')
  assert.equal(resolveProject(b), b)
})

test('resolveProject: an app repo with a .specboard pointer resolves to the sidecar it names', () => {
  const b = box()
  const app = join(b, 'app'); const side = join(b, 'app_specboard')
  mkdirSync(app); mkdirSync(side)
  w(app, POINTER, '../app_specboard\n')   // trailing newline is how an editor leaves it
  assert.equal(resolveProject(app), side)
})

test('resolveProject: a manifest in the directory wins over a stray pointer (the project is here)', () => {
  const b = box()
  w(b, MANIFEST, '{}')
  w(b, POINTER, '../elsewhere')
  assert.equal(resolveProject(b), b)
})

test('resolveProject: neither file → the directory itself (a fresh scaffold target)', () => {
  const b = box()
  assert.equal(resolveProject(b), b)
})

test('resolveProject: an empty pointer is ignored, not resolved to the directory\'s parent', () => {
  const b = box()
  w(b, POINTER, '\n')
  assert.equal(resolveProject(b), b)
})

test('appRoot: the manifest\'s `app` is resolved against the board root; absent → the root itself', () => {
  assert.equal(appRoot('/x/side', { app: '../app' }), resolve('/x/app'))
  assert.equal(appRoot('/x/side', {}), resolve('/x/side'))
  assert.equal(appRoot('/x/side', null), resolve('/x/side'))
})

test('mergeManifest carries the `app` path across an update like it carries `project`', () => {
  const fresh = { version: '9.9.9', files: { 'a.mjs': 'h' } }
  const prev = { version: '1.0.0', files: {}, app: '../app', project: { name: 'P' } }
  assert.deepEqual(mergeManifest(fresh, prev), { ...fresh, project: { name: 'P' }, app: '../app' })
  assert.deepEqual(mergeManifest(fresh, { version: '1.0.0', files: {} }), fresh)
})

// THE RULE (the human, 2026-09-04, second decision): the board lives INSIDE the app repo in a folder
// named `specboard/`, ignored wholesale by the app's git and versioned by its own — so no pointer is
// needed; the folder name is the convention. `.specboard` stays as the override for any other place.
import { NESTED, boardIgnoreLines } from './_skeleton.mjs'

test('the nested folder is named specboard', () => { assert.equal(NESTED, 'specboard') })

test('resolveProject: an app repo with a scaffolded specboard/ folder resolves to that folder', () => {
  const b = box()
  w(b, join(NESTED, MANIFEST), '{}')
  assert.equal(resolveProject(b), join(b, NESTED))
})

test('resolveProject: an explicit pointer wins over the specboard/ convention', () => {
  const b = box()
  w(b, join(NESTED, MANIFEST), '{}')
  mkdirSync(join(b, 'elsewhere'))
  w(b, POINTER, 'elsewhere')
  assert.equal(resolveProject(b), join(b, 'elsewhere'))
})

test('resolveProject: a bare specboard/ folder with no manifest is not a project (a fresh target)', () => {
  const b = box()
  mkdirSync(join(b, NESTED))
  assert.equal(resolveProject(b), b)
})

test('the app repo ignores the whole folder; the folder ignores its own scratch, never the harvest', () => {
  assert.ok(boardIgnoreLines().includes('node_modules/'))
  assert.ok(boardIgnoreLines().includes('spec/.auth/'))
  assert.ok(boardIgnoreLines().every(l => !/evidence|board\.html|_results-index/.test(l)))
})
