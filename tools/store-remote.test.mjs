// tools/store-remote.test.mjs — THE TWO REMOTE DRIVERS, tested WITHOUT a server (the final shape,
// 2026-09-06: "team = remote db url + cloud blob url"). A driver that can only be tested against a
// live Postgres or a live bucket is a driver nobody tests, so both are built to be driven: the pg
// driver takes its pool, the s3 driver takes its fetch. What these tests prove is the SQL and the
// HTTP each would actually issue — and, when a real endpoint IS configured in the environment, the
// last two tests connect to it. With no endpoint they SKIP, loudly and by name; they never pass by
// pretending (rule 3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { toPgPlaceholders, openPg } from './store-db-pg.mjs'
import { openS3Blobs, signV4, s3Key } from './store-blob-s3.mjs'
import { openStore, SCHEMA } from './store.mjs'

const sha = b => createHash('sha256').update(b).digest('hex')

// ---- pg -------------------------------------------------------------------------------------

test('the pg driver rewrites ? placeholders into $n, leaving strings and casts alone', () => {
  assert.equal(toPgPlaceholders('insert into t (a,b) values (?,?)'), 'insert into t (a,b) values ($1,$2)')
  assert.equal(toPgPlaceholders('select * from t where a = ? and b = ?'), 'select * from t where a = $1 and b = $2')
  assert.equal(toPgPlaceholders("select '?' as q where a = ?"), "select '?' as q where a = $1")
  assert.equal(toPgPlaceholders('select 1'), 'select 1')
})

test('the pg driver refuses to exist without its url — never a silent fallback to the local db', async () => {
  await assert.rejects(() => openPg({ env: {} }), /SPECBOARD_DB_URL/)
  await assert.rejects(() => openPg({ env: { SPECBOARD_DB_URL: 'sqlite:/tmp/x' } }), /postgres/)
})

test('the pg driver issues the same schema and the same statements the sqlite one does', async () => {
  const issued = []
  const pool = { query: async (text, params) => { issued.push([text, params]); return { rows: [] } }, end: async () => {} }
  const store = await openStore({ root: '/a/app', home: mkdtempSync(join(tmpdir(), 'kgpg-')), manifest: { projectId: 'p1', db: 'remote' }, env: { SPECBOARD_DB_URL: 'postgres://u:p@h/db' }, pool })
  assert.equal(store.dbDriver, 'pg')
  // every DDL statement of the ONE schema, with $n placeholders where it has parameters
  for (const ddl of SCHEMA) assert.ok(issued.some(([t]) => t.replace(/\s+/g, ' ').trim() === ddl.replace(/\s+/g, ' ').trim()), `schema issued: ${ddl.slice(0, 40)}…`)
  issued.length = 0
  await store.putRun({ runId: '77', at: 'z', screen: 'all', ms: 1, total: 1, failed: 0, ok: true, shotsByTest: {} })
  const insert = issued.find(([t]) => /insert into runs/i.test(t))
  assert.ok(insert, 'a run is one upsert')
  assert.match(insert[0], /on conflict/i)
  assert.match(insert[0], /\$1/)
  assert.doesNotMatch(insert[0], /\?/)
  assert.equal(insert[1][0], '77')
  await store.close()
})

test('a live Postgres, when the environment names one', { skip: process.env.SPECBOARD_TEST_PG_URL ? false : 'no SPECBOARD_TEST_PG_URL — the pg driver was proven against its SQL above, not against a server' }, async () => {
  const store = await openStore({ root: '/a/app', home: mkdtempSync(join(tmpdir(), 'kgpg-')), manifest: { projectId: 'pgtest-' + Date.now().toString(36), db: 'remote' }, env: { SPECBOARD_DB_URL: process.env.SPECBOARD_TEST_PG_URL } })
  await store.putRun({ runId: 'live-1', at: 'z', screen: 'all', ms: 1, total: 1, failed: 0, ok: true, shotsByTest: { t: { shots: [] } } })
  assert.deepEqual((await store.listRuns()).map(r => r.runId), ['live-1'])
  await store.dropAll()
  await store.close()
})

// ---- s3 -------------------------------------------------------------------------------------

test('SigV4 signs a request the way S3 expects, and a different payload is a different signature', () => {
  const at = new Date('2026-09-06T12:00:00Z')
  const h = signV4({ method: 'PUT', url: 'https://s3.example.com/bucket/abc.png', region: 'auto', key: 'AKIA', secret: 's3cr3t', payloadHash: 'a'.repeat(64), at })
  assert.match(h.authorization, /^AWS4-HMAC-SHA256 Credential=AKIA\/20260906\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/)
  assert.equal(h['x-amz-date'], '20260906T120000Z')
  assert.equal(h['x-amz-content-sha256'], 'a'.repeat(64))
  const other = signV4({ method: 'PUT', url: 'https://s3.example.com/bucket/abc.png', region: 'auto', key: 'AKIA', secret: 's3cr3t', payloadHash: 'b'.repeat(64), at })
  assert.notEqual(h.authorization, other.authorization)
})

test('a blob src maps back to its object key whichever shape it wears', () => {
  const name = sha(Buffer.from('x')) + '.png'
  assert.equal(s3Key('blob/' + name), name)
  assert.equal(s3Key('https://media.example.com/' + name), name)
  assert.equal(s3Key('https://s3.example.com/bucket/' + name), name)
})

test('the s3 driver PUTs the sha-named object and hands back the url the db stores', async () => {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('frame bytes').buffer, text: async () => '' } }
  const blobs = await openS3Blobs({ bucket: { endpoint: 'https://s3.example.com', name: 'specboard-tsumiki', publicBase: 'https://media.example.com', region: 'auto' }, env: { SPECBOARD_S3_KEY: 'AKIA', SPECBOARD_S3_SECRET: 's3cr3t' }, fetch: fetchImpl })
  const bytes = Buffer.from('frame bytes')
  const src = await blobs.put(bytes, 'png')
  assert.equal(src, `https://media.example.com/${sha(bytes)}.png`)
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].url, `https://s3.example.com/specboard-tsumiki/${sha(bytes)}.png`)
  assert.equal(calls[0].init.headers['x-amz-content-sha256'], sha(bytes))
  assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 /)
  assert.equal((await blobs.get(src)).toString(), 'frame bytes')
  assert.equal(calls[1].init.method, 'GET')
  await blobs.remove(src)
  assert.equal(calls[2].init.method, 'DELETE')
})

test('the s3 driver refuses to exist without its credentials or its bucket', async () => {
  await assert.rejects(() => openS3Blobs({ bucket: { endpoint: 'https://s3.example.com', name: 'b' }, env: {} }), /SPECBOARD_S3_KEY/)
  await assert.rejects(() => openS3Blobs({ bucket: null, env: { SPECBOARD_S3_KEY: 'k', SPECBOARD_S3_SECRET: 's' } }), /bucket/)
})

test('an s3 error is raised, never swallowed into a local write', async () => {
  const blobs = await openS3Blobs({
    bucket: { endpoint: 'https://s3.example.com', name: 'b' },
    env: { SPECBOARD_S3_KEY: 'k', SPECBOARD_S3_SECRET: 's' },
    fetch: async () => ({ ok: false, status: 403, text: async () => 'AccessDenied' })
  })
  await assert.rejects(() => blobs.put(Buffer.from('x'), 'png'), /403|AccessDenied/)
})

test('a live bucket, when the environment names one', { skip: process.env.SPECBOARD_TEST_S3_BUCKET ? false : 'no SPECBOARD_TEST_S3_BUCKET — the s3 driver was proven against the HTTP it issues above, not against a bucket' }, async () => {
  const blobs = await openS3Blobs({ bucket: { endpoint: process.env.SPECBOARD_TEST_S3_ENDPOINT, name: process.env.SPECBOARD_TEST_S3_BUCKET, region: process.env.SPECBOARD_TEST_S3_REGION || 'auto' }, env: process.env })
  const bytes = Buffer.from('specboard live probe ' + Date.now())
  const src = await blobs.put(bytes, 'txt')
  assert.equal((await blobs.get(src)).toString(), bytes.toString())
  await blobs.remove(src)
})

test('gc in cloud mode deletes from the BUCKET — the same keep-set, a driver-dispatched delete', async () => {
  const calls = []
  const name = sha(Buffer.from('keep me')) + '.png'
  const gone = sha(Buffer.from('drop me')) + '.png'
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method })
    if (init.method === 'GET' && url.includes('list-type=2')) {
      return { ok: true, status: 200, text: async () => `<ListBucketResult><Key>${name}</Key><Key>${gone}</Key></ListBucketResult>` }
    }
    return { ok: true, status: 200, text: async () => '' }
  }
  const blobs = await openS3Blobs({ bucket: { endpoint: 'https://s3.example.com', name: 'b', publicBase: 'https://media.example.com' }, env: { SPECBOARD_S3_KEY: 'k', SPECBOARD_S3_SECRET: 's' }, fetch: fetchImpl })
  const { gcWithDriver } = await import('./store.mjs')
  assert.deepEqual(await gcWithDriver(blobs, new Set([`https://media.example.com/${name}`])), { deleted: 1, kept: 1 })
  assert.deepEqual(calls.filter(c => c.method === 'DELETE').map(c => c.url), [`https://s3.example.com/b/${gone}`])
})
