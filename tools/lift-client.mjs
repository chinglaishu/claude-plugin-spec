// tools/lift-client.mjs — LIFT A FUNCTION OUT OF tools/board/client.js AND RUN ITS REAL BYTES.
//
// client.js is browser code read verbatim into board.html: it has no module boundary, so a test of
// anything in it either restates the rule (a second copy, free to drift from the shipped one) or
// lifts the shipped source by brace matching and runs exactly that. This is the second option, and
// it is the contract tools/repbody.test.mjs has had since 2026-09-04 — moved here so a second test
// file can use it without importing a test file (which would re-register that file's own cases in
// this one's process, and quietly inflate the suite's count).
export function lift (src, name) {
  const at = src.indexOf('function ' + name + ' (')
  if (at < 0) throw new Error('no function ' + name + ' in client.js — it was renamed or removed')
  const open = src.indexOf('{', at)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') { depth--; if (!depth) return src.slice(at, i + 1) }
  }
  throw new Error('unbalanced braces lifting ' + name)
}
