// The FLOW COMPOSER's pure logic (task 5; D4 of the 2026-08-20 beats spec + its two 2026-08-21
// amendments; CLAUDE.md rule 1's addendum). Everything here is a plain function — no fs, no DOM,
// no server — unit-tested in tools/compose.test.mjs. The server (serve-board.mjs) and the builder
// (build-board.mjs) feed it what spec-store read and write what it returns.
//
// The two-path contract this module carries:
//   DETERMINISTIC — when every chained beat is an exported step function whose requirement is
//   currently PASSED, emitFlow composes the flow file mechanically: no model involved. Every
//   assertion in the output was still written and proven red-first by hand in its unit home; only
//   the plumbing is mechanical. A composed flow's validity = those standing proofs + the composed
//   file passing its FIRST full run (rule 1 addendum, the human, 2026-08-21).
//   CLAUDE — a chain containing an inline (un-refactored) or not-yet-written beat becomes a ready
//   kg-e2e prompt (composePrompt) for the board's detached claude runner, or the human's clipboard.
//
// The board stores NO graph as truth: the library is derived on every build from behavior blocks +
// tests only (never the crawl), the chain lives in the browser (a localStorage draft), and the one
// artifact either path produces is an ordinary authored test file from the moment it is written.

// ── parseBeats — the per-screen steps.ts metadata, read statically ────────
// A steps module (spec/<screen>/steps.ts — the beat-function convention, see the kg-e2e skill)
// exports GIVEN (the fixture: fn, text, gives) and BEATS (one entry per exported beat function:
// fn, proves, name, needs, gives). Like parseTestPlan this is a deliberately light scan, not a
// parser with opinions: flat literals, quoted strings and string arrays only, degrading to
// nothing on an exotic file — never throwing, never executing project code.

const strKey = (src, key) => {
  const m = src.match(new RegExp('\\b' + key + '\\s*:\\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")'))
  return m ? String(m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1') : ''
}
const arrKey = (src, key) => {
  const m = src.match(new RegExp('\\b' + key + '\\s*:\\s*\\[([^\\]]*)\\]'))
  if (!m) return []
  const out = []
  for (const q of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    out.push(String(q[1] ?? q[2]).replace(/\\(['"\\])/g, '$1'))
  }
  return out
}
// the text between an opening bracket at `at` and its matching close — a scan, so a nested
// array/object inside BEATS never truncates the slice the way a lazy regex would
function bracketSlice (src, at, open, close) {
  let depth = 0
  for (let i = at; i < src.length; i++) {
    if (src[i] === open) depth++
    else if (src[i] === close && --depth === 0) return src.slice(at + 1, i)
  }
  return null
}

export function parseBeats (src) {
  const s = String(src || '')
  let given = null
  const gm = s.match(/export\s+const\s+GIVEN\s*=\s*\{/)
  if (gm) {
    const body = bracketSlice(s, gm.index + gm[0].length - 1, '{', '}')
    if (body != null) {
      const fn = strKey(body, 'fn')
      if (fn) given = { fn, text: strKey(body, 'text'), gives: arrKey(body, 'gives') }
    }
  }
  const beats = []
  const bm = s.match(/export\s+const\s+BEATS\s*=\s*\[/)
  if (bm) {
    const body = bracketSlice(s, bm.index + bm[0].length - 1, '[', ']')
    if (body != null) {
      // split into object literals by brace scan (an entry may span lines)
      let i = 0
      while ((i = body.indexOf('{', i)) !== -1) {
        const obj = bracketSlice(body, i, '{', '}')
        if (obj == null) break
        const fn = strKey(obj, 'fn')
        const proves = strKey(obj, 'proves')
        const name = strKey(obj, 'name')
        // an entry missing any of the three is not a callable beat — skipped, never guessed at
        if (fn && proves && name) {
          beats.push({ fn, proves, name, needs: arrKey(obj, 'needs'), gives: arrKey(obj, 'gives') })
        }
        i += obj.length + 2
      }
    }
  }
  return { given, beats }
}

// ── deriveLibrary — nodes from behavior blocks + tests ONLY ───────────────
// (the human, 2026-08-21: the crawl feeds only the schematic kit, never the chainable node list —
// a chainable node must carry a Then a real assertion holds, else the joint check validates a
// guess.) Three node kinds, one honesty rule:
//   beat    — an authored step function (steps.ts) whose metadata names what it proves; composable
//             only while that requirement reads PASSED (a changed/failed/stale one must be
//             re-proven first — composing against a moved text would thread a stale Then).
//   inline  — a requirement a test tags (it has real coverage) but no beat function yet; chainable
//             only through the Claude path, and marked so ("inline test — a flow using it runs via
//             Claude").
//   outline — a requirement with an authored behavior block and NO tagging test; the flow written
//             from it is that requirement's FIRST proof, red-first, always the Claude path.
//   nothing — a requirement with neither a behavior block nor a tagging test derives NO node: a
//             node exists only where a behavior block or a test does.

export function deriveLibrary (screens) {
  const nodes = []
  const givens = {}
  for (const s of screens || []) {
    givens[s.name] = (s.steps && s.steps.given) || null
    const beatCovered = new Set()
    for (const b of (s.steps && s.steps.beats) || []) {
      const req = (s.reqs || []).find(r => r.id === b.proves)
      nodes.push({
        id: `b:${s.name}:${b.fn}`,
        kind: 'beat',
        screen: s.name,
        proves: b.proves,
        name: b.name,
        fn: b.fn,
        needs: b.needs,
        gives: b.gives,
        proven: !!req && req.status === 'passed'
      })
      beatCovered.add(b.proves)
    }
    for (const r of s.reqs || []) {
      if (beatCovered.has(r.id)) continue          // the beat node IS this requirement's node
      const covered = (r.tests || []).length > 0
      if (covered) {
        nodes.push({
          id: `i:${s.name}:${r.id}`,
          kind: 'inline',
          screen: s.name,
          proves: r.id,
          name: r.title,
          fn: null,
          needs: [],
          gives: [],
          proven: r.status === 'passed'
        })
      } else if (r.behavior) {
        nodes.push({
          id: `o:${s.name}:${r.id}`,
          kind: 'outline',
          screen: s.name,
          proves: r.id,
          name: r.title,
          fn: null,
          needs: [],
          gives: [],
          proven: false
        })
      }
      // neither → no node (the honesty rule)
    }
  }
  return { nodes, givens }
}

export const nodeOf = (nodes, id) => (nodes || []).find(n => n.id === id) || null

// ── the joint check — beat N's Then must satisfy node N+1's Given ─────────
export function validateChain (nodes, chain, startGives) {
  const state = new Set(startGives || [])
  const out = []
  for (const id of chain || []) {
    const n = nodeOf(nodes, id)
    if (!n) { out.push({ id, node: null, missing: [] }); continue }
    out.push({ id, node: n, missing: n.needs.filter(t => !state.has(t)) })
    for (const t of n.gives) state.add(t)
  }
  return out
}
// what the chain's END provides — the library answers "what can I do next?" with it
export function chainEndState (nodes, chain, startGives) {
  const state = new Set(startGives || [])
  for (const id of chain || []) {
    const n = nodeOf(nodes, id)
    if (n) for (const t of n.gives) state.add(t)
  }
  return state
}
export function fillerFor (nodes, missing) {
  return (nodes || []).find(n => n.gives.some(g => (missing || []).includes(g))) || null
}

// every chained node function-shaped AND proven ⇒ the deterministic path; else the blockers, named
export function composable (nodes, chain) {
  const picked = (chain || []).map(id => nodeOf(nodes, id)).filter(Boolean)
  const blocking = picked.filter(n => n.kind !== 'beat' || !n.proven)
  return { ok: picked.length > 0 && picked.length === (chain || []).length && blocking.length === 0, blocking }
}

// qualified relative to the start screen, chain order, deduped
const coversOf = (picked, start) => {
  const out = []
  for (const n of picked) {
    const q = (n.screen === start ? '' : n.screen + ':') + n.proves
    if (!out.includes(q)) out.push(q)
  }
  return out
}

// ── composeCheck — every reason the deterministic emitter must refuse ─────
// The server re-derives the library and asks THIS before writing anything; the client's button is
// a rendering of the same answer, never the authority.
export function composeCheck ({ nodes, givens, chain, name, existing }) {
  const c = chain || []
  if (!c.length) return { ok: false, error: 'chain at least one beat first' }
  for (const id of c) if (!nodeOf(nodes, id)) return { ok: false, error: `no such beat: ${id}` }
  const picked = c.map(id => nodeOf(nodes, id))
  const comp = composable(nodes, c)
  if (!comp.ok) {
    const names = comp.blocking.map(n => n.proves).join(', ')
    return { ok: false, error: `${names} ${comp.blocking.length === 1 ? 'is' : 'are'} not function-shaped + proven — the Claude path writes this flow` }
  }
  const start = picked[0].screen
  const given = (givens || {})[start]
  if (!given) return { ok: false, error: `spec/${start}/steps.ts declares no GIVEN — the composed flow has no fixture to open on` }
  const v = validateChain(nodes, c, given.gives)
  const gap = v.find(x => x.missing.length)
  if (gap) return { ok: false, error: `the chain breaks before "${gap.node.name}" — needs ${gap.missing.join(' · ')}` }
  const title = String(name || '').trim()
  if (!title) return { ok: false, error: 'name the flow first' }
  if (existing && flowLanded(existing, title)) {
    return { ok: false, error: `a test named "${title}" already exists in spec/${start}/test.spec.ts` }
  }
  return { ok: true, start, covers: coversOf(picked, start), given }
}

// ── emitFlow — chain → the composed flow file (pure: text in, text out) ───
const sq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

// merge named imports into an existing `import { … } from '<module>'` line, or add one after the
// last top-level import — never a second line for the same module (a duplicate binding would not
// even parse).
export function mergeImports (existing, module, names) {
  let src = String(existing)
  const re = new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"].*$`, 'm')
  const m = src.match(re)
  if (m) {
    const have = m[1].split(',').map(s => s.trim()).filter(Boolean)
    const add = names.filter(n => !have.includes(n))
    if (!add.length) return src
    return src.replace(re, `import { ${have.concat(add).join(', ')} } from '${module}'`)
  }
  const line = `import { ${names.join(', ')} } from '${module}'`
  const imports = [...src.matchAll(/^import .*$/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    return src.slice(0, at) + '\n' + line + src.slice(at)
  }
  return line + '\n' + src
}

export function emitFlow ({ nodes, givens, chain, name, existing }) {
  const chk = composeCheck({ nodes, givens, chain, name, existing })
  if (!chk.ok) throw new Error(chk.error)
  const picked = chain.map(id => nodeOf(nodes, id))
  const { start, covers, given } = chk
  const title = String(name).trim()
  const module = scr => (scr === start ? './steps' : `../${scr}/steps`)

  // the beat calls — each inside its checkReq inside its flowStep, state threaded through all
  const body = picked.map((n, i) => {
    const qid = (n.screen === start ? '' : n.screen + ':') + n.proves
    return `  // beat ${i + 1} — proves ${qid}\n` +
      `  await flowStep('${sq(n.name)}', async () => {\n` +
      `    await checkReq('${sq(qid)}', async () => { await ${n.fn}(page, state) })\n` +
      `  })`
  }).join('\n')

  const block = `
// ── COMPOSED FLOW: '${sq(title)}' (deterministic emitter — tools/compose.mjs) ─────────────
// Every beat below is an authored step function, red-first-proven in its unit home
// (spec/<screen>/steps.ts); this file's first full run passing is the composition's validity
// (CLAUDE.md rule 1 addendum, the human 2026-08-21). No model was involved and no graph is
// stored — this is ordinary authored-test material from the moment it was written.
test('${sq(title)}', async ({ page }) => {
  await coverReqs(${covers.map(c => `'${sq(c)}'`).join(', ')})
  // the fixture Given, once — ${given.text}
  const state = await ${given.fn}(page)
${body}
})
`

  // imports: the harness (new file only) + the given + every beat, grouped per steps module
  const byModule = new Map()
  const need = (mod, fn) => {
    if (!byModule.has(mod)) byModule.set(mod, [])
    if (!byModule.get(mod).includes(fn)) byModule.get(mod).push(fn)
  }
  need(module(start), given.fn)
  for (const n of picked) need(module(n.screen), n.fn)

  let src = existing != null ? String(existing) : "import { test, checkReq, coverReqs, flowStep } from '../_base'\n"
  for (const [mod, fns] of byModule) src = mergeImports(src, mod, fns)
  const text = src.replace(/\n*$/, '\n') + block
  return { path: `spec/${start}/test.spec.ts`, text, testTitle: title, covers, start }
}

// ── composePrompt — the Claude-path prompt (also the manual-copy fallback) ─
export function composePrompt ({ nodes, givens, chain, name }) {
  const picked = (chain || []).map(id => nodeOf(nodes, id)).filter(Boolean)
  const start = picked.length ? picked[0].screen : ''
  const given = (givens || {})[start]
  const covers = coversOf(picked, start)
  const screens = new Set(picked.map(n => n.screen))
  const unproven = picked.filter(n => !n.proven)
  const beats = picked.map((n, i) =>
    `  beat ${i + 1} — ${n.name}   (proves ${(n.screen === start ? '' : n.screen + ':') + n.proves}` +
    `${n.proven ? '' : ' — UNPROVEN, red-first here'})`).join('\n')
  return `Author a ${screens.size > 1 ? 'cross-screen ' : ''}flow test for the "${start}" screen.

File: spec/${start}/test.spec.ts   (a flow lives in the screen it starts on)
Test name: '${String(name || 'Untitled flow').trim()}'
Declare up front: coverReqs(${covers.map(c => `'${c}'`).join(', ') || '…'})

Given (the fixture): ${given ? given.text : 'seed the golden fixture (spec/<screen>/steps.ts has no GIVEN yet)'}
${beats || '  (chain beats above)'}
${unproven.length ? `\nUnproven beats: ${unproven.map(n => n.proves).join(', ')} — this flow is their FIRST proof; same red-first standard.\n` : ''}
A beat already function-shaped (spec/<screen>/steps.ts) is CALLED, never re-written; an inline or
unwritten beat is authored red-first — and refactoring it into an exported step function while you
are there makes the next flow composable with no model at all (the beat-function convention,
kg-e2e).

Discipline (kg-e2e): failing test FIRST · every Then a real assertion · checkReq('<id>') inside the beat it proves · every asserted value visible in the recording · never weaken a test to go green.`
}

// ── flowLanded — did a test with exactly this title land in the source? ───
// The agent job's changed() asks the DISK, never the exit code (the runJob rule); the emit
// endpoint asks it to refuse a duplicate. Titles compare unescaped, exactly.
export function flowLanded (src, title) {
  const want = String(title)
  for (const m of String(src || '').matchAll(/\btest\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    const t = String(m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1')
    if (t === want) return true
  }
  return false
}
