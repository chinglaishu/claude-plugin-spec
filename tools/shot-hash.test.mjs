// shotHash is the ?h= cache-buster on every screen.png in board.html. It must be a CONTENT hash:
// same pixels → same hash (so a checkout/restore/touch never churns board.html), new screenshot →
// new hash (so a re-shot image is never served stale). Hashing mtime instead was the root of the
// restore-dance. Pure function: no board, no browser (node --test).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shotHash } from './spec-store.mjs'

const dir = mkdtempSync(join(tmpdir(), 'shot-hash-'))
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

// a tiny valid PNG header is plenty — shotHash reads bytes, it does not decode
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

test('same bytes at two different mtimes → SAME hash (touch must not churn board.html)', () => {
  const p = join(dir, 'same.png')
  writeFileSync(p, png)
  utimesSync(p, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
  const before = shotHash(p)
  utimesSync(p, new Date('2026-06-15T12:34:56Z'), new Date('2026-06-15T12:34:56Z'))
  assert.equal(shotHash(p), before)
})

test('different bytes → different hash (a re-shot screenshot still cache-busts)', () => {
  const a = join(dir, 'a.png')
  const b = join(dir, 'b.png')
  writeFileSync(a, png)
  writeFileSync(b, Buffer.concat([png, Buffer.from([1])]))
  assert.notEqual(shotHash(a), shotHash(b))
})

test('output stays the 12-hex slug the img template expects', () => {
  const p = join(dir, 'len.png')
  writeFileSync(p, png)
  assert.match(shotHash(p), /^[0-9a-f]{12}$/)
})

test('missing file throws ENOENT, exactly as before (readScreen guards with hasShot)', () => {
  assert.throws(() => shotHash(join(dir, 'nope.png')), { code: 'ENOENT' })
})
