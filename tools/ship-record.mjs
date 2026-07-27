// Shipping a run's screenshots and video somewhere other than this repo. Two destinations the CEO
// asked for: a git branch (versioned, shareable through the host) and a bucket (survives the
// local prune, shareable by URL). Both are BEST EFFORT — a shipping failure logs and falls back to
// the local copy; it never fails the run, because the record is a convenience and the verdict is not.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()

// Commit the run's record onto a branch, in an ISOLATED worktree so the working tree the CEO (and
// any other agent) is using is never touched. Pushing to origin is an OUTWARD action, so it is
// off unless explicitly asked for (Setup's "push to origin"): the default commits locally to the
// branch, versioned and safe, and the CEO pushes when they mean to.
export function shipToGit (recordDir, runId, branch, root, push = false) {
  if (!branch) return { ok: false, error: 'no branch name set' }
  const wt = join(tmpdir(), `specboard-shots-${process.pid}-${runId}`)
  try {
    try { git(['worktree', 'remove', '--force', wt], root) } catch { /* none to remove */ }
    let exists = true
    try { git(['rev-parse', '--verify', branch], root) } catch { exists = false }
    git(['worktree', 'add', ...(exists ? [wt, branch] : ['-b', branch, wt])], root)
    try {
      const dest = join(wt, 'run-shots', runId)
      mkdirSync(dest, { recursive: true })
      cpSync(recordDir, dest, { recursive: true })
      git(['add', 'run-shots'], wt)
      git(['-c', 'user.email=specboard@local', '-c', 'user.name=specboard',
        'commit', '-m', `run ${runId} — ${readdirSync(dest).length} artifact(s)`], wt)
      const sha = git(['rev-parse', 'HEAD'], wt).slice(0, 12)
      let pushed = false
      let pushError = null
      if (push) {
        try { git(['push', 'origin', branch], root); pushed = true }
        catch (e) { pushError = String(e.stderr || e.message || e).slice(0, 160) }
      }
      return { ok: true, branch, sha, requestedPush: push, pushed, pushError }
    } finally {
      try { git(['worktree', 'remove', '--force', wt], root) } catch { /* leave it */ }
    }
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message || err).slice(0, 300) }
  }
}

const TYPE = { '.png': 'image/png', '.webm': 'video/webm' }

// PUT each artifact to `<bucketUrl>/<runId>/<name>` and return the record rewritten to point at the
// bucket, so the board loads shots from there and they outlive the local prune. Works against any
// endpoint that accepts an unauthenticated PUT at that path (a presigned setup, a simple upload
// server, a permissive bucket) — the failure, when a bucket needs auth, is a clear PUT status.
export async function shipToBucket (recordDir, runId, shotsByTest, bucketUrl, root) {
  if (!bucketUrl) return { ok: false, error: 'no bucket URL set' }
  const base = bucketUrl.replace(/\/+$/, '')
  const uploaded = {}
  const put = async localRel => {
    const abs = join(root, localRel)
    if (!existsSync(abs)) return null
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
