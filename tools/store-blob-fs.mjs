// tools/store-blob-fs.mjs — THE DEFAULT BLOB DRIVER: content-addressed files under the project's
// data home, `~/.specboard/<projectId>/blobs/<sha256>.<ext>`, which the board serves at `/blob/…`.
// The string the db stores IS the file's name and IS the URL — one src, two shapes (this one, or the
// bucket's https url from the s3 driver), and the client treats both as opaque.
//
// Write-once: the same bytes are the same file, so a re-harvest of an unchanged frame is a no-op.
// Temp-then-rename, like every other write in this tool — a reader never sees half a blob.
import { existsSync, mkdirSync, writeFileSync, renameSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { blobName, blobPath, isBlobRel } from './store-address.mjs'

export async function openFsBlobs ({ home }) {
  if (!home) throw new Error('openFsBlobs: no data home')
  const dir = join(home, 'blobs')
  return {
    mode: 'fs',
    home,
    async put (bytes, ext) {
      const name = blobName(bytes, ext)
      const dest = join(dir, name)
      if (!existsSync(dest)) {
        mkdirSync(dir, { recursive: true })
        const tmp = `${dest}.${process.pid}.tmp`
        writeFileSync(tmp, bytes)
        renameSync(tmp, dest)
      }
      return `blob/${name}`
    },
    async get (src) {
      const abs = blobPath(home, src)
      if (!abs) throw new Error(`not a local blob: ${String(src).slice(0, 80)}`)
      return readFileSync(abs)
    },
    async remove (src) {
      const abs = blobPath(home, src)
      if (!abs || !existsSync(abs)) return false
      rmSync(abs, { force: true })
      return true
    },
    async list () {
      if (!existsSync(dir)) return []
      return readdirSync(dir).filter(n => !/\.tmp$/.test(n)).map(n => `blob/${n}`).filter(isBlobRel).sort()
    },
    async close () {}
  }
}
