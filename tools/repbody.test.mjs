// tools/repbody.test.mjs — THE BOARD'S SECOND WALL, unit-tested (final review I1/R6, 2026-09-04).
//
// `repBody` is the last thing that touches a committed replica before it becomes an iframe's
// srcdoc. The frame is `sandbox=''` (every restriction on, no scripts), so this is defence in
// depth — but it is also the code that would make the request if a file ever carried an external
// url, from the browser of whoever opens the row. Three defects were live at HEAD: the handler test
// matched only QUOTED `on…="…"`, the comment strip ran AFTER the tests (so an honest file whose
// html header mentioned `<script` was refused wholesale and the row went blank), and nothing asked
// about `src`/`href` at all.
//
// It lives in tools/board/client.js, which is browser code read verbatim into board.html and has no
// module boundary — so it is lifted OUT of that file's source here by brace matching and run for
// real, exactly the bytes the board runs. That is the same contract tools/stepper.test.mjs has with
// tools/board/stepper.js (which reaches its bytes through globalThis.SBStepper instead); the point
// either way is that no second copy of the rule exists to drift from the shipped one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')

// the named function's own source, from `function <name> (` to its matching close brace
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

// eslint-disable-next-line no-new-func
const repBody = new Function(lift(SRC, 'repBody') + '; return repBody')()

test('an honest replica passes through, its html comment header dropped', () => {
  const html = '<!-- specboard replica-1 · board:R1 b1 after · Expected · sanitised, no script -->\n' +
    '<style>.rep .r0{color:rgb(1, 2, 3)}</style>\n<div class="rep r0">hello</div>'
  const out = repBody(html)
  assert.ok(out.startsWith('<style>'), 'the header is gone: ' + out.slice(0, 40))
  assert.ok(out.includes('hello'), 'the picture survives')
})

test('a script tag, a quoted handler and a javascript: url each refuse the whole file', () => {
  assert.equal(repBody('<div><script>alert(1)</script></div>'), '')
  assert.equal(repBody('<div onclick="x()">hi</div>'), '')
  assert.equal(repBody('<a href="javascript:void(0)">go</a>'), '')
})

test('an UNQUOTED handler refuses it too — the hole the quoted-only test left', () => {
  // `/\son\w+\s*=\s*["']/` walked straight past this one.
  assert.equal(repBody('<img src=data:image/png;base64,AA onerror=alert(1)>'), '')
  assert.equal(repBody('<div onmouseover=steal()>hi</div>'), '')
})

test('a comment that merely MENTIONS a script no longer refuses an honest file', () => {
  // The strip used to run after the test, so this file — whose picture is clean — went blank with
  // no reason given. A false negative on an honest harvest is a lie of the same family as a false
  // green: the reader sees "no picture" and believes the harvest had none.
  const out = repBody('<!-- <script> was dropped by the capture -->\n<div class="rep">kept</div>')
  assert.ok(out.includes('kept'), 'the file is rendered: ' + JSON.stringify(out))
  assert.ok(!out.includes('<script'), 'and the comment is gone with it')
})

test('an external src/href is neutralised in place, and the rest of the picture is kept', () => {
  const html = '<div class="rep"><img src="https://evil.example/leak.png" alt="ad">' +
    '<img src=//evil.example/x.gif><a href=\'http://evil.example\'>go</a>' +
    '<img src="data:image/png;base64,AAAA"></div>'
  const out = repBody(html)
  assert.ok(!/https?:/.test(out), 'no external scheme survives: ' + out)
  assert.ok(!/src\s*=\s*["']?\/\//.test(out), 'no protocol-relative src survives: ' + out)
  assert.ok(out.includes('data:image/png;base64,AAAA'), 'a data: image is the app\'s own pixels and stays')
  assert.ok(out.includes('>go<') && out.includes('alt="ad"'), 'the words and the rest of the markup are kept')
  assert.equal((out.match(/data-external-src-removed/g) || []).length, 3, 'each removal is said, not hidden')
})

test('nothing in, nothing out', () => {
  assert.equal(repBody(''), '')
  assert.equal(repBody(null), '')
  assert.equal(repBody(undefined), '')
})
