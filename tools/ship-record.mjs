// Shipping a run's screenshots and video somewhere other than this machine. ONE destination now: a
// bucket — the record survives the local prune and is readable by URL, which is the first half of the
// team store (the same shape the s3 blob driver speaks). It is BEST EFFORT — a shipping failure logs
// and keeps the local copy; it never fails the run, because the record is a convenience and the
// verdict is not.
//
// THE SECOND DESTINATION IS GONE (T16, 2026-09-06, decision A): `shipToGit` committed each run's
// screenshots and video onto a branch of the app's own repo, in an isolated worktree, optionally
// pushed. It is the exact anti-pattern this storage plan exists to remove — a run record is a CACHE,
// and git keeps a cache forever (the 850 MB of history that started the plan). Deleted rather than
// deprecated: an option nobody should choose is not worth the code that offers it. Records live in
// the data home (~/.specboard/<projectId>/runs/) and go to a bucket when a person asks.

import { existsSync, readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

const TYPE = { '.png': 'image/png', '.webm': 'video/webm' }

// PUT each artifact to `<bucketUrl>/<runId>/<name>` and return the record rewritten to point at the
// bucket, so the board loads shots from there and they outlive the local prune. Works against any
// endpoint that accepts an unauthenticated PUT at that path (a presigned setup, a simple upload
// server, a permissive bucket) — the failure, when a bucket needs auth, is a clear PUT status.
//
// The last argument is the caller's `resolveRel` — spec-store's ONE door from a record string to the
// file it names (rule 7, fixed here 2026-09-06 while retiring the git half). It used to be the repo
// ROOT, joined onto each string: correct while a shot was `spec/_runs/<id>/x.png`, and silently wrong
// since the data home landed, because a shot is now `blob/<sha>.png`. Every `existsSync` missed, every
// put returned null, and the function reported `ok` with `count: 0` while REPLACING the record with
// empty shot lists — a green that shipped nothing and lost the local pointers on the way.
export async function shipToBucket (recordDir, runId, shotsByTest, bucketUrl, resolveRel) {
  if (!bucketUrl) return { ok: false, error: 'no bucket URL set' }
  if (typeof resolveRel !== 'function') return { ok: false, error: 'no path resolver given' }
  const base = bucketUrl.replace(/\/+$/, '')
  const uploaded = {}
  const put = async localRel => {
    const abs = resolveRel(localRel)
    if (!abs || !existsSync(abs)) return null
    const url = `${base}/${runId}/${basename(localRel)}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': TYPE[extname(localRel)] || 'application/octet-stream' },
      body: readFileSync(abs)
    })
    if (!res.ok) throw new Error(`PUT ${url} → ${res.status}`)
    return url
  }
  try {
    const out = {}
    for (const [title, rec] of Object.entries(shotsByTest || {})) {
      const shots = []
      for (const s of rec.shots || []) { const u = uploaded[s] ?? (uploaded[s] = await put(s)); if (u) shots.push(u) }
      let video = null
      if (rec.video) video = uploaded[rec.video] ?? (uploaded[rec.video] = await put(rec.video))
      out[title] = { shots, video }
    }
    return { ok: true, shotsByTest: out, count: Object.keys(uploaded).length }
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 300) }
  }
}
