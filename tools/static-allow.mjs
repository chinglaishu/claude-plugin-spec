// tools/static-allow.mjs — THE STATIC SERVER'S ALLOWLIST, as a pure decision.
//
// It is an allowlist, not a traversal guard. Confining reads to a root is not enough: this plugin
// runs inside somebody's project, so "anything under the repo" includes .git/config with its remote
// urls, .env, credentials and every file they have ever committed — all readable by anything that
// can reach this port. It once served .git/config. Keep it an allowlist.
//
// THREE KINDS AND NO FOURTH (the data home, 2026-09-05/06):
//   board — the generated page itself
//   spec  — the AUTHORED tree (prd.md, test.spec.ts, steps.ts, and the two pictures a test writes)
//   blob  — a content address in the project's data home: every frame, skeleton, replica, face,
//           faces sheet and recording the fold landed
// A blob is matched by its SHAPE — `blob/<sha256>.<ext>` — so a caller can only ask for bytes some
// record already named; the FILE each kind names is found by spec-store's resolveRel, which confines
// each kind to its own root. A run's record directory is NOT here: it is a run's scratch inside the
// data home (its report, its raw screenshots), swept when the run falls off the log, and what the run
// KEEPS is a blob like any other picture.
const BLOB = /^blob\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/

export function allowKind (rel) {
  const s = String(rel || '')
  if (!s || s.includes('..')) return null
  if (s === 'board.html') return 'board'
  if (BLOB.test(s)) return 'blob'
  if (/^spec\/.+/.test(s)) return 'spec'
  return null
}
