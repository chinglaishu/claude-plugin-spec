// tools/store-address.mjs — THE ADDRESS, pure. Where a project's data home is, what a blob is called,
// and which of the two shapes a picture reference wears. Kept in its own module so both blob drivers
// and the store itself can read it without an import cycle; tools/store.mjs re-exports every name
// here, and that is the door everything else in the tool uses.
//
// A src is ONE string with two shapes (the final shape, 2026-09-06):
//   blob/<sha256>.<ext>   — a file in <home>/blobs/, which the local board serves at /blob/…
//   https://…             — the same sha-named object in an S3-compatible bucket
// Content addressing survives the switch: the object's key IS the sha256 either way, so dedupe and
// gc-by-reference are the same logic behind either driver.
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve, basename } from 'node:path'

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const BLOB = /^blob\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/
const URL_SRC = /^https:\/\/[^\s"'<>]+$/

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function dataHomeRoot (env = process.env, home = homedir()) {
  const v = env && typeof env.SPECBOARD_HOME === 'string' ? env.SPECBOARD_HOME.trim() : ''
  return v || join(home, '.specboard')
}

// The manifest's `projectId` (written once by the scaffold, committed, carried across updates — so
// every clone of a project maps to the same home, and the team store keys on it); else a name that is
// stable per checkout and cannot collide between two checkouts of the same-named app.
export function projectId (root, manifest) {
  const raw = manifest && (manifest.projectId ?? manifest.id)
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (ID.test(id)) return id
  const abs = resolve(String(root || '.'))
  return `${basename(abs)}-${sha256(abs).slice(0, 8)}`
}

export function dataHome (root, manifest, env = process.env, home = homedir()) {
  return join(dataHomeRoot(env, home), projectId(root, manifest))
}

export function blobName (bytes, ext) {
  const e = String(ext || 'bin').toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  return `${sha256(bytes)}.${e}`
}

export const isBlobRel = s => BLOB.test(String(s || ''))

// Either shape — this is what a gate, a reader or the gc asks before treating a string as a picture.
export const isBlobSrc = s => isBlobRel(s) || URL_SRC.test(String(s || ''))

export function blobPath (home, rel) {
  const m = BLOB.exec(String(rel || ''))
  return m ? join(home, 'blobs', m[1]) : null
}
