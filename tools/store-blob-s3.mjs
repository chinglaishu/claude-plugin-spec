// tools/store-blob-s3.mjs — THE CLOUD BLOB DRIVER: the same sha256-named object, PUT to any
// S3-compatible bucket (S3, R2, B2, MinIO), with its url in the db (the final shape, 2026-09-06:
// "media local-but-out-of-repo or a cloud blob url"). Flipping `media: "cloud"` in the committed
// manifest is what makes proof media team-visible before any hosted board exists.
//
// No SDK: the request is signed here with AWS SigV4 over node:crypto and sent with fetch, because the
// whole surface this needs is PUT / GET / DELETE / ListObjectsV2 on one bucket, and a dependency that
// large for four verbs is not worth its supply chain. `fetch` is injectable, so what this driver
// actually sends over the wire is unit-testable without a bucket.
//
// The credentials are env-only (SPECBOARD_S3_KEY / SPECBOARD_S3_SECRET) and their absence is FATAL:
// a cloud mode that quietly wrote to the local disk would fork the store in silence (rule 3).
import { createHash, createHmac } from 'node:crypto'
import { blobName } from './store-address.mjs'

const EMPTY_SHA = createHash('sha256').update('').digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
const hex = b => createHash('sha256').update(b).digest('hex')

// The object key a src names, whichever shape it wears — the sha-named file is always the last
// segment, which is exactly why the two shapes are interchangeable.
export const s3Key = src => String(src || '').split('?')[0].split('/').pop()

// AWS Signature Version 4, the S3 flavour (payload hashed, no chunking). Pure given `at`.
export function signV4 ({ method, url, region = 'auto', service = 's3', key, secret, payloadHash = EMPTY_SHA, at = new Date(), headers = {} }) {
  const u = new URL(url)
  const amzDate = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const dateStamp = amzDate.slice(0, 8)
  const h = { host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v
  const names = Object.keys(h).sort()
  const canonicalHeaders = names.map(n => `${n}:${String(h[n]).trim()}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&')
  const canonicalUri = u.pathname.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/')
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonicalRequest)].join('\n')
  const signing = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), 'aws4_request')
  const signature = createHmac('sha256', signing).update(toSign).digest('hex')
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` }
}

export async function openS3Blobs ({ bucket, env = process.env, fetch: fetchImpl = globalThis.fetch } = {}) {
  const b = bucket || {}
  if (!b.endpoint || !b.name) throw new Error('media: "cloud" needs a bucket { endpoint, name } in the manifest')
  const key = String((env && env.SPECBOARD_S3_KEY) || '').trim()
  const secret = String((env && env.SPECBOARD_S3_SECRET) || '').trim()
  if (!key || !secret) throw new Error('media: "cloud" needs SPECBOARD_S3_KEY and SPECBOARD_S3_SECRET in the environment — refusing to fall back to local blobs')
  const region = String(b.region || 'auto')
  const base = String(b.endpoint).replace(/\/+$/, '')
  const publicBase = b.publicBase ? String(b.publicBase).replace(/\/+$/, '') : ''
  const objectUrl = name => `${base}/${b.name}/${name}`
  const srcOf = name => (publicBase ? `${publicBase}/${name}` : objectUrl(name))

  const send = async (method, url, { body = null, payloadHash = EMPTY_SHA, headers = {} } = {}) => {
    const signed = signV4({ method, url, region, key, secret, payloadHash, headers })
    const res = await fetchImpl(url, { method, headers: signed, body })
    if (!res || !res.ok) {
      let detail = ''
      try { detail = res && res.text ? (await res.text()).slice(0, 200) : '' } catch { detail = '' }
      throw new Error(`s3 ${method} failed (${res ? res.status : 'no response'}) for ${url}${detail ? ': ' + detail : ''}`)
    }
    return res
  }

  return {
    mode: 's3',
    bucket: b.name,
    async put (bytes, ext) {
      const name = blobName(bytes, ext)
      await send('PUT', objectUrl(name), { body: bytes, payloadHash: name.split('.')[0] })
      return srcOf(name)
    },
    async get (src) {
      const res = await send('GET', objectUrl(s3Key(src)))
      return Buffer.from(await res.arrayBuffer())
    },
    async remove (src) {
      await send('DELETE', objectUrl(s3Key(src)))
      return true
    },
    async list () {
      const out = []
      let token = ''
      do {
        const url = `${base}/${b.name}?list-type=2${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
        const xml = await (await send('GET', url)).text()
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) out.push(srcOf(m[1]))
        const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)
        token = next ? next[1] : ''
      } while (token)
      return out.sort()
    },
    async close () {}
  }
}
