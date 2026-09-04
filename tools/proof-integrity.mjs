// Proof integrity — a green board is honest only if every `checkReq` actually asserts a VALUE. A
// test that merely checks `.toBeVisible()` still turns its requirement "proven" even though nothing
// about the requirement's substance was checked — the existence-only proof this tool exists to catch
// (rule 2: "assert something that can fail"). Two tools live here:
//
//   lint      — static: read every spec/*/test.spec.ts, flag any checkReq block with no value
//               assertion. Cheap, always safe to run, wired into CI-shaped workflows.
//   perturb   — dynamic: nudge a screen's golden.json numbers and re-run its suite. A proof that
//               still PASSES against wrong numbers survived only because nothing actually reads the
//               value — the golden-perturbation escape hatch for a lint that cannot see through a
//               loose regex (e.g. `expect(x).toBe(cachedSameWrongValue)`).
//
// Pure and Playwright-free (extractCheckReqBlocks / hasValueAssertion / lintSource / perturbNumbers),
// so the part that decides "is this proof real" is unit-tested directly (tools/proof-integrity.test.mjs),
// mirroring tools/coverage.mjs's split between the pure derivation and its thin CLI/reporter shell.

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, readdirSync } from 'node:fs'
// the drawing kit itself: the gate never restates what a mirror should contain — it asks the module
// that draws one (renderWireframe's per-frame report, mirrorGaps, layoutHash), so the gate and the
// renderer can never drift apart. That drift IS the defect this gate exists to catch.
import { renderWireframe, mirrorGaps, gapSummary, frameGroup, layoutHash } from './viz.mjs'
// …and the replica's own guard, for the same reason: what "the replica looks like the app" MEANS is
// decided in ONE place (tools/replica-gate.mjs), read by the in-page gate at capture time and by
// this CLI alike. A gate that restates the capture's rules drifts from them.
import { replicaAttrs, claimGaps, textOf, containsRun, GATE_TOL, GATE_MIN, NO_TEXT_TAGS } from './replica-gate.mjs'
// …and the PRD's own authorities on what a requirement SAYS: parsePrd for its blocks, parseBehavior
// for its beats. The intent lint below weighs a beat's claims against the Then a HUMAN wrote, so it
// has to read that Then through the very parsers the board renders it with — never its own reading.
import { parsePrd } from './spec-store.mjs'
import { parseBehavior } from './behavior.mjs'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

// A value assertion checks WHAT is on screen (a number, a string, a count above zero); an existence
// assertion (toBeVisible, toBeAttached, toHaveCount(0)) only checks that SOMETHING is there. Only the
// former can fail because a requirement's substance changed — the latter would still pass with the
// requirement's guts deleted, as long as the element itself still renders.
// `proveVisible` is one of them, and the strongest: it READS the value off the element (an input's
// value, everything else's rendered text), photographs it with the claim burned in, and asserts the
// two are equal. A beat whose only assertion is a proveVisible is the opposite of existence-only.
const VALUE_ASSERTION = /toHaveText|toContainText|toContain\(|toHaveValue|toHaveAttribute|toHaveURL|toHaveCount\(\s*[1-9]|toBe\(|toEqual\(|toMatch|toBeCloseTo|toBeGreaterThan|toBeLessThan|proveVisible\s*\(/

export function hasValueAssertion (body) {
  return VALUE_ASSERTION.test(stripComments(body))     // prose is not an assertion — see stripComments
}

// Find every `checkReq('<id>', async () => { … })` (authored specs only — this brace-balances from
// the first `{` after `=>`, so it does not need a real JS parser). A `}` inside a quoted string in the
// body would end the balance early — an accepted v1 limitation; specs are authored by us and do not
// do that today.
const CALL = /checkReq\(\s*(['"])([^'"]+)\1/g

// …and PROSE IS NOT A BLOCK either (fix round 2, 2026-09-04). A comment naming a call — board's own
// "// this is the SECOND checkReq('R19') of the test" — was read as a real one, inventing a fourth
// block for a two-beat requirement and clamping it onto the last beat: a phantom that no edit to
// the code could fix, because there was no code. The scan runs over a COMMENT-MASKED copy in which
// every comment character is a space and every newline is kept, so offsets and line numbers are the
// original's; the bodies are sliced from the original text.
export function maskComments (src) {
  const text = String(src || '')
  const blank = s => s.replace(/[^\n]/g, ' ')
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      const e = endOfString(text, i)
      if (e > i) { out += text.slice(i, e + 1); i = e; continue }
    }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const e = endOfComment(text, i)
      out += blank(text.slice(i, e + 1))
      i = e
      continue
    }
    out += c
  }
  return out
}

export function extractCheckReqBlocks (src) {
  const text = String(src || '')
  const scan = maskComments(text)
  const blocks = []
  CALL.lastIndex = 0
  let m
  while ((m = CALL.exec(scan))) {
    const id = m[2]
    const arrow = scan.indexOf('=>', m.index + m[0].length)
    if (arrow === -1) continue
    const braceStart = scan.indexOf('{', arrow)
    if (braceStart === -1) continue
    let depth = 0
    let end = -1
    for (let i = braceStart; i < scan.length; i++) {
      if (scan[i] === '{') depth++
      else if (scan[i] === '}') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end === -1) continue // unbalanced — malformed source, skip rather than guess
    const line = text.slice(0, m.index).split('\n').length
    blocks.push({ id, body: text.slice(braceStart + 1, end), line })
  }
  return blocks
}

// One row per checkReq block: does it assert a value, or only that something exists.
//
// …READ THROUGH THE BEAT FUNCTIONS IT CALLS (phase 6, 2026-09-04). A checkReq that keeps its
// assertion in an exported step function — the beat-function convention the kg-e2e skill teaches —
// used to read EXISTENCE-ONLY here, because this looked only at the block's own bytes: on both
// boards the gate was red for a reason that had nothing to do with a weak proof. `opts.helpers` are
// the other sources a beat may live in (every screen's steps.ts); expandBody appends what the block
// calls, two levels deep. Not a weakening — the assertion is there, one call away.
export function lintSource (src, opts = {}) {
  const bodies = functionBodies(String(src || ''))
  for (const h of opts.helpers || []) {
    for (const [k, v] of functionBodies(h)) if (!bodies.has(k)) bodies.set(k, v)
  }
  return extractCheckReqBlocks(src)
    .map(({ id, line, body }) => ({ id, line, ok: hasValueAssertion(expandBody(body, bodies)) }))
}

// Deep-walk an arbitrary JSON value (object/array/scalar), nudging every numeric leaf so a proof that
// depends on the ACTUAL number can no longer pass by accident: an integer moves by +1 (still an
// integer, so a type-only check still passes — only a value check catches it), a float is scaled by
// 1%. Rounded to 6 decimal places so repeated floating-point multiplication cannot leave 1e-15 noise
// in a diff a human is meant to read. Every change is recorded with its dotted path so a perturbed
// golden.json is auditable, not just "different".
function round6 (n) { return Math.round(n * 1e6) / 1e6 }

export function perturbNumbers (value) {
  const changes = []
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.map((item, i) => walk(item, path ? `${path}.${i}` : String(i)))
    if (v !== null && typeof v === 'object') {
      const out = {}
      for (const [k, val] of Object.entries(v)) out[k] = walk(val, path ? `${path}.${k}` : k)
      return out
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      const to = Number.isInteger(v) ? v + 1 : round6(v * 1.01)
      changes.push({ path, from: v, to })
      return to
    }
    return v
  }
  return { value: walk(value, ''), changes }
}

// ── THE MIRROR GATE ──────────────────────────────────────────────────────────────────────────────
// The human, 2026-09-02: "make sure the gap between schematic and proof will not exist again."
//
// A committed spec/<screen>/viz/<id>.svg with data-viz-kind="wireframe" is a CLAIM about the app's
// measured layout — the same skeletons the proof cell photographs beside it. Two ways that claim
// stops being true, both derived here from the tree, neither ever stored:
//
//   · a MIRROR GAP — the drawing no longer contains something the skeleton measured (a word, a
//     plate, the ring), or it paints a box the page had faded away. That is the "schematic still
//     looks like a skeleton" defect, caught by machine instead of by the human's eye.
//   · a moved LAYOUT PIN — the harvest has been re-taken and the geometry moved, so the committed
//     drawing is of an older screen. data-viz-layout carries the pin the drawing was made with.
//
// The frame ordering is NOT restated here: renderWireframe reports, per frame, the very skeleton it
// drew that frame from, and the gate asks mirrorGaps the same question of the COMMITTED file's own
// frame group. One authority, one reading.
const layoutFile = (spec, screen, id, slot) => {
  const p = join(spec, screen, 'evidence', `${id}.b${slot}.layout.json`)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}
// the whole harvest for one requirement, in beat order — the same reading tools/viz-derive.mjs makes
// when it draws: each beat's two ends and every asserted value it rang, stopping at the first gap.
export function harvestOf (spec, screen, id, max = 12) {
  const out = []
  for (let n = 1; n <= max; n++) {
    const before = layoutFile(spec, screen, id, `${n}.before`)
    const after = layoutFile(spec, screen, id, `${n}.after`)
    const values = []
    for (let k = 1; k <= 12; k++) {
      const v = layoutFile(spec, screen, id, `${n}.v${k}`)
      if (!v) break
      values.push(v)
    }
    if (!before && !after && !values.length) break
    out.push({ before, after, values })
  }
  return out
}
export function checkMirrors (spec = 'spec') {
  const rows = []
  if (!existsSync(spec)) return rows
  const screens = readdirSync(spec, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name).sort()
  for (const screen of screens) {
    const dir = join(spec, screen, 'viz')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter(n => n.endsWith('.svg')).sort()) {
      const id = f.slice(0, -4)
      const svg = readFileSync(join(dir, f), 'utf8')
      if (!/data-viz-kind="wireframe"/.test(svg)) continue      // an archetype claims no app layout
      const row = { screen, id, gaps: [], pinOk: true, ok: true, why: '' }
      rows.push(row)
      const lays = harvestOf(spec, screen, id)
      if (!lays.length) {
        row.ok = false
        row.why = 'no layout skeletons on disk — the drawing claims a harvest that is gone'
        continue
      }
      const pin = (svg.match(/data-viz-layout="([^"]*)"/) || [])[1] || ''
      row.pinOk = pin === layoutHash(lays)
      // the renderer's own per-frame report: which skeleton is frame i, and how it was framed
      const drawn = renderWireframe(lays, {})
      if (!drawn) {
        row.ok = false
        row.why = 'the harvest no longer draws anything — nothing to mirror'
        continue
      }
      for (const fr of drawn.gaps) {
        const body = frameGroup(svg, fr.frame)
        if (!body) {
          row.gaps.push({ kind: 'missing-frame', what: `frame ${fr.frame}`, x: 0, y: 0, w: 0, h: 0 })
          continue
        }
        for (const g of mirrorGaps(fr.layout, body, { focus: fr.focus, anchors: fr.anchors, h: fr.h })) {
          row.gaps.push({ ...g, frame: fr.frame })
        }
      }
      row.ok = row.pinOk && !row.gaps.length
      // BOTH reasons, where both are true — a moved harvest usually drags gaps in behind it, and
      // naming only the first would hide why the redraw is needed
      const why = []
      if (row.gaps.length) why.push(`the drawing is missing what the harvest measured — ${gapSummary(row.gaps)}`)
      if (!row.pinOk) why.push('the layout pin has moved: the harvest is newer than the drawing')
      row.why = why.join('; ')
    }
  }
  return rows
}

// ── THE REPLICA GATE (phase 3, 2026-09-03; one html per moment, 2026-09-04) ──────────────────────
// The same guard, on the other picture. Since the human's 2026-09-03 decision the row's Expected
// half is an HTML replica of the app's own component with the requirement's claims applied —
// `<id>.b<n>.<phase>.expected.html`. It is a claim, and a claim nobody measures stops being true
// silently; this refuses one that:
//
//   1. was NEVER GATED — no `data-replica-layout`. The in-page gate (spec/_moment.mjs `gateInPage`,
//      in the same pass as the capture) renders the UNEDITED tree back in a hidden iframe and walks
//      it with the very walk that measured the live page, then stamps its verdict on this file's
//      root; a file with no pin is one that walk never checked. Honest, and refused.
//   2. the HARVEST HAS MOVED PAST — the pin no longer hashes the skeleton beside it on disk.
//   3. the IN-PAGE WALK already found a gap in (or that ran out of bytes: `data-replica-truncated`).
//   4. whose WORDS are not the skeleton's: every text-bearing element the live walk measured inside
//      the replica's own region must appear in the file's text. This is the rule that needs no DOM,
//      so deleting a text node from a committed replica fails the gate here.
//   5. that does not carry a FAILED CLAIM's own expected value.
//
// Rules 4 and 5 pull against each other on ONE file, and the seam between them is the claim: rule 5
// demands the value the requirement asked for, and applying it is exactly what makes the live text
// rule 4 would demand no longer be there. So rule 4 EXEMPTS what a claim moved — a live element
// standing inside a claim's own ring, or one whose text is that claim's `got` (the string the
// Expected replaced with its `expected`). Those are the nodes the capture marks `data-claim`; the
// exemption is made on the live side because that is the side with boxes on it.
//
// Since 2026-09-04 there is no `.actual.html` at all: a moment's Actual half is the photograph named
// beside it (the human: "why does the Expected also need a replica — the Actual is the screenshot").
// The pattern still MATCHES one, so a stale file left by an older harness is refused as ungated
// rather than passing unseen; the fold sweeps them (tools/evidence.mjs legacyActualReplicas).
const REPLICA_FILE = /^(.+)\.b(\d+)\.(before|after|v\d+)\.(actual|expected)\.html$/
export function checkReplicas (spec = 'spec') {
  const rows = []
  if (!existsSync(spec)) return rows
  const screens = readdirSync(spec, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name).sort()
  for (const screen of screens) {
    const dir = join(spec, screen, 'evidence')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter(n => REPLICA_FILE.test(n)).sort()) {
      const m = REPLICA_FILE.exec(f)
      const file = join(dir, f)
      const row = { screen, id: m[1], file, side: m[4], ok: true, why: '', gaps: [] }
      rows.push(row)
      let html = ''
      try { html = readFileSync(file, 'utf8') } catch { html = '' }
      const a = replicaAttrs(html)
      const why = []
      if (a.truncated) row.gaps.push({ kind: 'truncated', what: 'the capture ran out of bytes', x: 0, y: 0, w: 0, h: 0 })
      if (!a.layout) why.push('not gated: no data-replica-layout — nothing walked this replica back')
      for (const g of a.gaps) row.gaps.push(g)
      // the skeleton this moment was measured with, one name away (tools/evidence.mjs's own rule)
      const layPath = file.replace(/\.(actual|expected)\.html$/, '.layout.json')
      let lay = null
      if (existsSync(layPath)) { try { lay = JSON.parse(readFileSync(layPath, 'utf8')) } catch { lay = null } }
      if (!lay) {
        why.push('no layout skeleton beside it — the replica claims a harvest that is gone')
      } else {
        if (a.layout && a.layout !== layoutHash(lay, null)) {
          why.push('the layout pin has moved: the harvest is newer than the replica')
        }
        {
          // rule 4 — the words, with no DOM: the skeleton's own text, inside the replica's region
          const text = textOf(html)
          const reg = a.region
          // …and WHAT A CLAIM MOVED IS NOT A MISSING WORD (2026-09-04, one html per moment). This
          // file has the requirement's claims applied to it, so the live text a claim replaced is,
          // correctly, not in it — demanding it back would refuse every Expected that does its job.
          // Two exemptions, both read off the claims the file itself carries: a live element that
          // stands inside a claim's own ring box, and a live text that IS a claim's `got`.
          const claimRings = a.claims.map(c => (c && c.ring && typeof c.ring === 'object' ? c.ring : null))
            .filter(r => r && Number.isFinite(Number(r.x)))
            .map(r => ({ x: Number(r.x), y: Number(r.y), w: Number(r.w != null ? r.w : r.width) || 0, h: Number(r.h != null ? r.h : r.height) || 0 }))
          const claimGot = a.claims.map(c => String((c && c.got) || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
          const claimed = (e, t) => claimGot.some(g => g === t || containsRun(g, t)) ||
            claimRings.some(r => e.x + e.w > r.x - GATE_TOL && e.x < r.x + r.w + GATE_TOL &&
              e.y + e.h > r.y - GATE_TOL && e.y < r.y + r.h + GATE_TOL)
          for (const e of (Array.isArray(lay.els) ? lay.els : [])) {
            if (row.gaps.length >= 12) break
            // a tag that never paints a reader-visible word (fix round 2, item 2 — the same list
            // tools/replica-gate.mjs's in-page half reads, so the two can never disagree) carries no
            // text demand here either
            if (NO_TEXT_TAGS.indexOf(e.tag) >= 0) continue
            const t = String(e.text == null ? '' : e.text).replace(/\s+/g, ' ').trim()
            if (!t) continue
            if (e.w < GATE_MIN || e.h < GATE_MIN) continue      // the walk's own floor, from the module that owns it
            // …and the PICTURE IS A SUBTREE, not a rectangle (fix round 2, I6 — the same question
            // `replicaGaps` asks, completed here after the census caught it): a toast, a dismiss
            // control, any body-level overlay whose box falls inside the region hangs off the body
            // beside the scene root, and no honest replica of that root can contain it. Board R16's
            // ✕ — measured at 1359,146 with `inRoot: 0` — was reported here as a missing word on a
            // file that was right. An unmarked skeleton is read exactly as before.
            if (lay.rootMarked && e.inRoot === 0) continue
            if (reg && !(e.x >= reg.x - GATE_TOL && e.y >= reg.y - GATE_TOL &&
              e.x + e.w <= reg.x + reg.w + GATE_TOL && e.y + e.h <= reg.y + reg.h + GATE_TOL)) continue
            // …as its own word run, never as a bare substring (fix round 1, I1): here the haystack is
            // the WHOLE file's text with no box to pin it, so plain containment would let a live `5`
            // be answered by any `15` anywhere in the page
            if (claimed(e, t)) continue
            if (!containsRun(text, t)) row.gaps.push({ kind: 'missing-text', what: t, x: e.x, y: e.y, w: e.w, h: e.h })
          }
        }
      }
      // rule 5 — the Expected's own gate: what the requirement asked for must be in it
      for (const g of claimGaps(textOf(html), a.claims)) row.gaps.push(g)
      if (row.gaps.length) why.unshift(`the replica is missing what the harvest measured — ${gapSummary(row.gaps)}`)
      row.ok = !row.gaps.length && !why.length
      row.why = why.join('; ')
    }
  }
  return rows
}

// ── THE AUTHORED-INTENT LINT (phase 6, 2026-09-04) ───────────────────────────────────────────────
// lintSource above asks whether a proof reads a VALUE at all. This asks the next question, the one
// the human's Expected view made unavoidable: does it read the values the REQUIREMENT NAMES.
//
// A Then that names three facts, proven by a beat that claims one, is a third of a requirement
// wearing the requirement's whole green — and since the Expected picture is built from the beat's
// CLAIMS, a fact no claim covers is also a fact no picture can ever show. So every fact a Then names
// must be a SOFT claim (`proveVisible(target, expected, label, { soft: true })`): the beat reaches
// and photographs each of them and fails ONCE at its end with the whole list, instead of stopping at
// the first red with the rest of the requirement unshown.
//
// Pure, like everything above it: (prdText, specSource) in, rows out, unit-tested directly.

// THE FACT-SPLITTING RULE, deliberately blunt and written down. A Then is cut at ` — `, `; `,
// `, and `, ` and ` and a bare `, ` — every seam whose TWO SIDES each carry three words or more.
// There is no verb test (fix round 2, 2026-09-04, the controller): the old list
// (is/are/shows/reads/stays/…) missed the base forms and the verbs these PRDs actually use
// (opens, scrolls, hides, moves, frames, plays, holds, sits, names, refuses, unfolds), so 47 of 65
// beats carried a seam that never split and "every fact a Then names is a claim" was not what the
// gate enforced. OVER-SPLITTING IS SAFE — a fragment is then either claimed or declared, and both
// are visible — while UNDER-SPLITTING hides a fact behind a green row, which is the failure this
// lint exists to prevent. The three-word floor is what keeps an apposition ("a name, route, or
// requirement") from becoming a fact of its own.
const MIN_WORDS = 3
const SEP = /( — |; |, and | and |, )/g
// …and never inside an ASIDE. A parenthetical (`*(removed 2026-09-02, the human: "…")*`), a
// backticked token or a quoted phrase carries its own punctuation, and a `; ` inside one is not a
// seam between two facts. Masked to same-length filler so the separator scan reads positions that
// still index the ORIGINAL text — three passes, which covers one level of nesting.
const ASIDE = /\([^()]*\)|`[^`]*`|"[^"]*"/g
const MASK = '\u0001'   // a char no PRD carries, so a mask can never read as a word
function maskAsides (text) {
  let m = text
  for (let pass = 0; pass < 3; pass++) m = m.replace(ASIDE, s => MASK.repeat(s.length))
  return m
}
// a side's weight is its WORDS — a masked aside counts as nothing, so "the banner is shown *(…)*"
// is four words, not forty.
function wordCount (side) {
  return maskAsides(String(side || '')).replace(/[\u0001]+/g, ' ').trim().split(/\s+/).filter(Boolean).length
}
export function splitFacts (then) {
  const text = String(then || '').trim()
  if (!text) return []
  const masked = maskAsides(text)
  const segs = []
  let pos = 0
  SEP.lastIndex = 0
  let m
  while ((m = SEP.exec(masked))) {
    segs.push(text.slice(pos, m.index), text.slice(m.index, m.index + m[0].length))
    pos = m.index + m[0].length
  }
  segs.push(text.slice(pos))
  // Each seam is weighed on its OWN two sides — the segment before it and the segment after —
  // never on everything accumulated so far, or an apposition would split at its second comma:
  // "only cards matching a name, route, or requirement stay" is one fact, and reading the left as
  // the whole run up to "route" makes its last seam look like a seam between two facts.
  const facts = []
  let cur = segs[0]
  for (let i = 1; i < segs.length; i += 2) {
    const sep = segs[i]
    const left = segs[i - 1]
    const right = segs[i + 1] || ''
    if (wordCount(left) >= MIN_WORDS && wordCount(right) >= MIN_WORDS) { facts.push(cur.trim()); cur = right }
    else cur = cur + sep + right
  }
  if (cur.trim()) facts.push(cur.trim())
  return facts.length ? facts : [text]
}

// AN ABSENCE FACT — one a `proveVisible(locator, MISSING, …)` claim can close. A fact is an
// absence when its SUBJECT or its PREDICATE says something is not there: no/none/nothing/never/not/
// without/no longer/gone/missing/absent/removed/hidden/cleared/empty/closed/dismissed/disappears/
// vanishes (fix round 2, 2026-09-04, the controller — the narrow first list read "gone from the
// slot", "not a full-screen scrim" and "never refused or queued" as ordinary facts, so an absence
// the splitter had just isolated could be declared away instead of claimed).
// Because the vocabulary is wide, the REFUSAL it drives is narrow: see lintIntent — a beat that
// photographs nothing at all has no page open, and an absence there has no more surface to ring
// than a presence does.
const ABSENCE = /\b(no|none|nothing|never|not|without|gone|missing|absent|removed|hidden|cleared|empty|closed|dismissed|disappears?|vanishes?|nowhere|nobody)\b/i
export function isAbsenceFact (fact) {
  return ABSENCE.test(String(fact || ''))
}
// …and the REFUSAL below asks a NARROWER question than the vocabulary does. `isAbsenceFact` says
// whether a fact speaks of an absence at all — which is what tells an author that a MISSING claim is
// available. What may REFUSE a declaration is a fact that names a THING whose absence can be
// photographed: "there is no control", "carries no chip", "the card is gone from Open", "no rows
// show". A fragment like "not a truncated snippet" or "never a gap" says the app shows nothing OF A
// KIND — and a `proveVisible(page.locator('.truncated'), MISSING, …)` on a selector the app has
// never had is an assertion that cannot fail, which is the one thing rule 2 refuses. Those are
// declarable, with their reason.
const ABSENT_SUBJECT = /(^\s*(no|none|nothing)\b(?!\s+(longer|more)\b))|\b(there (is|are) no|carries no|shows no|has no|holds no|with no|is gone|are gone|is absent|are absent|is removed|are removed|is hidden|are hidden|is cleared|are cleared|is dismissed|is closed|disappears?|vanishes?|nowhere)\b/i
export function absenceTarget (fact) {
  return ABSENT_SUBJECT.test(String(fact || ''))
}

// THE BEAT'S CLAIMS. The beat-function convention (kg-e2e) keeps the checkReq AROUND a call into
// spec/<screen>/steps.ts, so the claims a beat makes are usually not in the block's own body — they
// are in the step function it calls. Counting only what the block literally contains would flag the
// very convention the skills teach, so the block is EXPANDED: every function it calls that is
// defined in the spec or in a steps file is appended, two levels deep, each name once.
// A tiny tolerant reader — not a JS parser, and it does not need to be: it has to find where each
// named function's body starts and ends well enough that the claims inside it are the claims of
// THAT function. Three shapes appear in these specs: `function f (…) { … }`, `const f = (…) => { … }`
// and the CONCISE arrow `const f = l => l.evaluate(…)`, which has no body brace at all.
//
// C1 (fix round 2, 2026-09-04): the first version took `text.indexOf('{', …)` as the body's opening
// brace, so a concise arrow captured the next `{` ANYWHERE in the file and every claim in that
// unrelated block was credited to callers of the arrow. On spec/board/test.spec.ts that gave board
// R11's beat 2 — a block containing no proveVisible at all — "2 claims · ok", the one false green
// this phase exists to make impossible. A body is now either the brace block that IMMEDIATELY
// follows the parameter list, or, for a concise arrow, the expression after `=>` up to the end of
// the statement.
const DECL = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]|(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:async\s+)?(?=[(<A-Za-z_$])/g
// skip whitespace and comments from `i`
function skipWs (text, i) {
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (text.startsWith('//', i)) { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl + 1; continue }
    if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i); i = e === -1 ? text.length : e + 2; continue }
    return i
  }
}
// walk from an opening bracket to its match, stepping over strings, template literals AND COMMENTS.
// The comments are not a nicety: `// … see the unit test's note` opens a string that runs to the
// next apostrophe in the file, and the balance then ends in the wrong place — which is how
// `draftedRowBecomesCard` (init R3's whole beat) read as having no body at all, and its beat as
// having no claims (found while completing init's claims, 2026-09-04).
function matchBracket (text, start) {
  const OPEN = { '(': ')', '[': ']', '{': '}' }
  const stack = [OPEN[text[start]]]
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') { i++; continue }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) { i = endOfComment(text, i); continue }
    if (c === "'" || c === '"' || c === '`') { i = endOfString(text, i); continue }
    if (OPEN[c]) { stack.push(OPEN[c]); continue }
    if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i }
  }
  return -1
}
function endOfComment (text, start) {
  if (text[start + 1] === '/') { const nl = text.indexOf('\n', start); return nl === -1 ? text.length : nl }
  const e = text.indexOf('*/', start + 2)
  return e === -1 ? text.length : e + 1
}
// A QUOTE WHOSE PARTNER IS NOT ON ITS LINE IS NOT A STRING (fix round 2, 2026-09-04). Telling a
// regex literal from a division needs a parser this deliberately is not, and
// `const plain = (s: string) => String(s).replace(/[`*]/g, '')` puts a BACKTICK inside a character
// class: read as a template literal it ran to the next backtick 200 KB later, so `plain`'s "body"
// was the rest of spec/board/test.spec.ts and every caller of that two-line helper was credited
// with 61 claims. A `'`/`"` string cannot contain a raw newline at all, and a template that does is
// rarer here than a regex — and the cost of the two mistakes is not symmetric: over-capturing
// invents claims (a false green), under-capturing loses them (a gap an author then closes).
function endOfString (text, start) {
  const q = text[start]
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue }
    if (text[i] === '\n') return start          // no partner on this line — not a string opener
    if (text[i] === q) return i
  }
  return start
}
// a concise arrow's body: the expression after `=>`, ending at the `;` or the line end that closes
// the statement, or at the bracket that closes whatever the arrow was passed to.
function expressionEnd (text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') { i++; continue }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) { i = endOfComment(text, i); continue }
    if (c === "'" || c === '"' || c === '`') { i = endOfString(text, i); continue }
    if (c === '(' || c === '[' || c === '{') { depth++; continue }
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) return i; depth--; continue }
    if (depth === 0 && (c === ';' || c === '\n' || c === ',')) return i
  }
  return text.length
}
export function functionBodies (src) {
  const text = String(src || '')
  const out = new Map()
  DECL.lastIndex = 0
  let m
  while ((m = DECL.exec(text))) {
    const name = m[1] || m[2]
    let i = m.index + m[0].length
    let body = null
    if (m[1]) {
      // function f (…) {   — the params start at the char the match ended on
      const open = text.lastIndexOf(text[i - 1] === '(' ? '(' : '<', i)
      const close = matchBracket(text, text[i - 1] === '(' ? i - 1 : open)
      if (close === -1) continue
      let j = skipWs(text, close + 1)
      if (text[j] === ':') { j = skipWs(text, text.indexOf('{', j)) }   // a return-type annotation
      if (text[j] !== '{') continue
      const end = matchBracket(text, j)
      if (end === -1) continue
      body = text.slice(j + 1, end)
    } else {
      // const f = (…) => … | const f = x => …
      if (text[i] === '(' || text[i] === '<') {
        const close = matchBracket(text, i)
        if (close === -1) continue
        i = close + 1
      } else {
        while (i < text.length && /[\w$]/.test(text[i])) i++
      }
      i = skipWs(text, i)
      if (text[i] === ':') { const arrow = text.indexOf('=>', i); if (arrow === -1) continue; i = arrow }  // a return-type annotation
      if (!text.startsWith('=>', i)) continue          // not an arrow at all — a plain value
      i = skipWs(text, i + 2)
      if (text[i] === '{') {
        const end = matchBracket(text, i)
        if (end === -1) continue
        body = text.slice(i + 1, end)
      } else {
        body = text.slice(i, expressionEnd(text, i))
      }
    }
    if (body != null && !out.has(name)) out.set(name, body)
  }
  return out
}
const CALLED = /\b([A-Za-z_$][\w$]*)\s*\(/g
export function expandBody (body, bodies, depth = 2, seen = new Set()) {
  let text = String(body || '')
  if (depth <= 0) return text
  const names = new Set()
  CALLED.lastIndex = 0
  let m
  while ((m = CALLED.exec(text))) names.add(m[1])
  for (const name of names) {
    if (seen.has(name) || !bodies.has(name)) continue
    seen.add(name)
    text += '\n' + expandBody(bodies.get(name), bodies, depth - 1, seen)
  }
  return text
}
// …AND PROSE IS NOT A CLAIM. Found on board R19: a comment saying why that harvest records no ring
// — "its specs read the page with reveal(), not proveVisible()" — counted as the beat's one claim,
// leaving it one short of the gap it actually had. A lint a sentence can satisfy is not a lint.
// Deliberately blunt: a `//` line comment only where it OPENS the line (so a `//` inside a url or a
// regex on a code line is untouched), and `/* … */` wherever it appears.
export function stripComments (src) {
  return String(src || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '')
}
// the DECLARED reasons a beat carries: `intentGap('…')` (spec/_base.ts, a run-time no-op). Read out
// of the code the same way the claims are, comments stripped first. A declaration covers ONE FACT,
// exactly as a claim does (fix round 2) — a Then that names five facts, four of them on screen and
// one only in a file, is four claims and one declaration, never one declaration waving the beat
// through.
const DECLARED = /intentGap\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g
export function declarationsIn (body) {
  const code = stripComments(body)
  const out = []
  DECLARED.lastIndex = 0
  let m
  while ((m = DECLARED.exec(code))) out.push(readable(m[2]))
  return out
}
// …and it prints READABLY. A declaration long enough to need concatenating (`'a ' + 'b'`) came out
// with its glue and its escapes verbatim — the readable half of a debt, made unreadable (M1).
function readable (raw) {
  return String(raw)
    .replace(/\\(['"`])/g, '$1')
    .replace(/['"`]\s*\+\s*['"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
export function declaredIn (body) {
  return declarationsIn(body)[0] || ''
}
const countOf = (text, re) => (String(text).match(re) || []).length
// DOES THIS BLOCK OPEN A PAGE? (final review I3, 2026-09-04.) A zero-claim `intentGap` waives a
// whole beat, and the reason it may — "a beat with no page open has no surface for any fact" — was
// TESTED as "the beat made no claims", which an author satisfies by simply not writing one. Board
// R11 beat 1 opened /#howitworks/kg-deep, asserted three visible/hidden things, claimed nothing,
// declared once, and the lint printed DECLARED for all three facts; checkReq photographs that page
// regardless, so "no surface" was not true of it. What decides is whether the block touches a page
// at all, which its own source says plainly. Deliberately generous — any of these tokens means a
// page is open, so the waiver is only ever granted to a block that is provably headless (dispatch
// driving /api/run through `request`).
const PAGE_TOKENS = /\bpage\s*\.|\blocator\s*\(|\bgetBy[A-Z]|\bproveVisible\s*\(|\breveal\s*\(|\bclick\s*\(/
export function opensPage (body) {
  return PAGE_TOKENS.test(stripComments(String(body || '')))
}

export function claimsIn (body) {
  const code = stripComments(body)
  const decls = declarationsIn(code)
  return {
    open: opensPage(code),
    claims: countOf(code, /proveVisible\s*\(/g),
    soft: countOf(code, /soft\s*:\s*true/g),
    // an ABSENCE claim: `proveVisible(locator, MISSING, label, { soft: true })`, which passes
    // exactly while the thing is gone. Counted so a beat that HAS claimed its absences is not
    // refused its declaration for the facts that genuinely have no surface.
    missing: countOf(code, /,\s*MISSING\s*,/g),
    decls,
    declared: decls[0] || ''
  }
}

// WHICH BEAT A checkReq BLOCK PROVES — the BEAT_CURSOR rule, read statically. spec/_base.ts counts
// checkReq calls per id and shows the Nth call the Nth beat, CLAMPED to the last; the cursor resets
// per TEST (the page fixture), so the second test's first checkReq('R1') is beat 1 again. Both halves
// matter here: without the reset a file's later tests would be lined up against beats they never
// prove, and without the clamp the extra calls that pile onto a one-beat requirement would vanish.
const TEST_START = /^test\s*\(/
export function blockBeats (specSource, id, beats, screen = '') {
  const src = String(specSource || '')
  const starts = src.split('\n').map((l, i) => (TEST_START.test(l) ? i + 1 : 0)).filter(Boolean)
  const testOf = line => starts.filter(s => s <= line).length
  const cursors = new Map()
  const out = []
  for (const b of extractCheckReqBlocks(src)) {
    if (b.id !== id && !(screen && b.id === `${screen}:${id}`)) continue
    const t = testOf(b.line)
    const cursor = cursors.get(t) || 0
    cursors.set(t, cursor + 1)
    out.push({ ...b, test: t, walk: cursor + 1, beat: beats ? Math.min(cursor + 1, beats) : cursor + 1 })
  }
  return out
}

// the ways a beat's claims fall short of its Then, in ONE place so the row's verdict and the
// message it prints can never disagree: too few claims for the facts, a multi-fact beat that would
// stop at its first red, and a beat that photographs no value at all. A DECLARATION covers one fact
// exactly as a claim does (fix round 2) — it is a visible debt in the fact's place, not a pass.
function gapWhy (facts, claims, soft, decls = 0, open = true) {
  const why = []
  // …and a beat that opens NO PAGE has no surface for any fact (dispatch drives /api/run with no
  // browser): one declaration answers for every fact it names. The moment a beat opens a page, a
  // declaration covers ONE fact and the rest still need their claims — otherwise a single line
  // would wave through the facts the screen does show. Whether a page is open is read off the
  // block's own source (`opensPage`), NOT inferred from "it made no claims": that inference was
  // satisfiable by simply not writing a claim, which is the hole final review I3 named.
  const covered = claims + (claims === 0 && !open && decls ? facts : decls)
  if (facts >= 2 && covered < facts) {
    // …and it is NAMED when the shortfall is the waiver being asked for on an open page, because the
    // author's next move differs: not "one more claim" but either claiming these facts at all or
    // declaring each of them, one line per fact.
    const named = (claims === 0 && open && decls) ? 'declared-on-an-open-page — ' : ''
    why.push(named + `the Then names ${facts} facts, the beat claims ${claims}` + (decls ? ` and declares ${decls}` : ''))
  }
  if (facts >= 2 && soft < claims) why.push(`${claims - soft} of its claims ${claims - soft === 1 ? 'is' : 'are'} not soft — a multi-fact beat stops at its first red instead of photographing the rest`)
  if (facts === 1 && covered === 0) why.push('the Then names a fact and no claim covers it — nothing photographs the value')
  return why.join('; ')
}

export function lintIntent (prdText, specSource, opts = {}) {
  const { fm, reqs } = parsePrd(String(prdText || ''))
  const screen = opts.screen || fm.screen || ''
  const bodies = functionBodies(String(specSource || ''))
  for (const h of opts.helpers || []) {
    for (const [k, v] of functionBodies(h)) if (!bodies.has(k)) bodies.set(k, v)
  }
  const rows = []
  for (const r of reqs) {
    const beh = parseBehavior(r.body)
    if (!beh) {
      rows.push({ screen, id: r.id, beat: 0, facts: 0, claims: 0, soft: 0, ok: true, state: 'no-beat', why: 'no behaviour block — nothing authored for a claim to cover' })
      continue
    }
    const blocks = blockBeats(specSource, r.id, beh.beats.length, screen)
      .map(b => ({ ...b, ...claimsIn(expandBody(b.body, bodies)) }))
    // THE LINT MIRRORS THE HARNESS EXACTLY (fix round 2, 2026-09-04, the controller). BEAT_CURSOR
    // files each block's harvest under the beat its POSITION names — block k IS beat k, clamped to
    // the last, the cursor resetting per test. So a requirement whose blocks do not WALK its beats
    // hands a beat's pictures to a sentence they are not about: board R20 carried seven blocks for
    // six beats, and its beat-1 row showed the harvest of a block in another test entirely.
    // The count-level defect is CLAMPING: a test with more blocks for a requirement than it has
    // beats. Every block past the last one is filed under the last beat while being about something
    // else, and no reading of the harness can say otherwise.
    //
    // What is NOT a mismatch is a second test proving FEWER of its beats — a flow that walks beat 1
    // of a three-beat requirement and stops. (This rule did fire on that shape for an afternoon; it
    // flagged the many-to-many coverage the whole board is built on — board R10 is proven by five
    // tests, dispatch R5 by a unit and a flow — so it was wrong, and it is the WORST-block scoring
    // below, not a count, that catches the real version of that defect: a block that harvests a
    // beat without covering it. Board R20's seventh block is caught there, on beat 1's own row.)
    if (blocks.length) {
      const walks = new Map()
      for (const b of blocks) walks.set(b.test, (walks.get(b.test) || 0) + 1)
      const lens = [...walks.values()]
      const over = lens.some(n => n > beh.beats.length)
      if (over) {
        rows.push({
          screen, id: r.id, beat: 0, facts: 0, claims: 0, soft: 0, ok: false, state: 'beat-mismatch',
          line: blocks[0].line,
          why: `beat-mismatch (${blocks.length} blocks, ${beh.beats.length} beats) — ` +
            'a test makes more checkReq calls for this requirement than it has beats, so the extra ' +
            'blocks clamp onto the last beat and harvest it while being about something else' +
            `; blocks at ${blocks.map(b => `line ${b.line}→beat ${b.beat}`).join(', ')}`
        })
      }
    }
    beh.beats.forEach((beat, i) => {
      const n = i + 1
      const facts = splitFacts(beat.then)
      const here = blocks.filter(b => b.beat === n)
      if (!here.length) {
        rows.push({ screen, id: r.id, beat: n, facts: facts.length, claims: 0, soft: 0, ok: true, state: 'no-beat', why: 'no checkReq maps to this beat — coverage already reads it unproven' })
        return
      }
      // THE BLOCK OF BEAT k, NEVER THE BEST OF SEVERAL (fix round 2, the controller's I2). Several
      // blocks can map to one beat — a unit and a flow proving the same sentence — and every one of
      // them writes the SAME <id>.b<n> evidence files, so the pictures the board actually shows are
      // the LAST one's: playwright.board.ts runs workers:1, in declaration order, so the last block
      // in source order is the last to run and the last to file. That block is therefore the one
      // scored, and the row names its line. (Scoring the best of them is what let board R20's beat 1
      // read ok from a block in another test while the picture came from an empty one; scoring the
      // WORST reads truer still, but it demands every flow that re-proves a requirement repeat every
      // claim of the unit that owns it — a demand the many-to-many coverage model does not make.)
      const scored = here.map(b => ({ ...b, gap: gapWhy(facts.length, b.claims, b.soft, b.decls.length, b.open) }))
      // `harvesting`, not `worst` (final review I4): this IS the last block in source order, and the
      // name said otherwise for as long as it existed. workers:1 in declaration order means the last
      // block to run is the last to file <id>.b<n>, so it is the block whose pictures the board
      // actually shows — which is the whole reason it is the one scored.
      const harvesting = scored[scored.length - 1]
      const decls = harvesting.decls
      // A DECLARED GAP: the beat says IN ITSELF why a fact has no screen surface. Printed as its own
      // row with the reason and NOT counted against the exit code — a visible debt, never a pass.
      //
      // It is REFUSED where the Then names an ABSENCE the beat has not claimed: an absence is
      // claimable with `proveVisible(locator, MISSING, …)`, which passes exactly while the thing is
      // gone, and a declaration there would be a way of not writing the claim. The refusal asks two
      // things first, because the absence vocabulary is deliberately wide (I4): the beat must
      // photograph SOMETHING — a beat with no claim at all has no page open (dispatch drives
      // /api/run with no browser), and an absence there has no more surface to ring than a presence
      // does — and it must not already carry a MISSING claim for each absence the Then names.
      const absent = facts.filter(absenceTarget)
      const unclaimedAbsence = absent.length > harvesting.missing
      if (decls.length && absent.length && harvesting.claims > 0 && unclaimedAbsence) {
        rows.push({
          screen, id: r.id, beat: n, facts: facts.length, claims: harvesting.claims, soft: harvesting.soft,
          ok: false, state: 'gap', declared: decls.join(' · '), line: harvesting.line,
          why: (harvesting.gap ? harvesting.gap + '; and' : 'its') + ` declaration is refused — "${absent[0].slice(0, 60)}" names an ` +
            'absence, which is claimable: proveVisible(locator, MISSING, label, { soft: true }) passes ' +
            'exactly while the thing is gone'
        })
        return
      }
      if (!harvesting.gap && decls.length) {
        rows.push({
          screen, id: r.id, beat: n, facts: facts.length, claims: harvesting.claims, soft: harvesting.soft,
          ok: true, state: 'declared', why: decls.join(' · '), declared: decls.join(' · '), line: harvesting.line
        })
        return
      }
      rows.push({
        screen, id: r.id, beat: n, facts: facts.length, claims: harvesting.claims, soft: harvesting.soft,
        ok: !harvesting.gap, state: harvesting.gap ? 'gap' : 'ok', why: harvesting.gap || '', line: harvesting.line
      })
    })
  }
  return rows
}

// CLI --------------------------------------------------------------------------------------------
// Thin, not unit-tested (mirrors tools/staff.mjs / tools/update.mjs: the pure derivation above is
// what proof-integrity.test.mjs exercises).

function screenDirs () {
  if (!existsSync('spec')) return []
  return readdirSync('spec', { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort()
}

function runLint () {
  // every screen's beats, for BOTH lints below: a checkReq keeps its assertion in a step function
  // (the beat-function convention), and board/test.spec.ts calls ../dispatch/steps, so the whole
  // set is handed to each screen rather than only its own.
  const helpers = screenDirs()
    .map(s => join('spec', s, 'steps.ts'))
    .filter(p => existsSync(p))
    .map(p => readFileSync(p, 'utf8'))
  let anyBad = false
  for (const screen of screenDirs()) {
    const path = join('spec', screen, 'test.spec.ts')
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    for (const row of lintSource(src, { helpers })) {
      const status = row.ok ? 'ok' : 'EXISTENCE-ONLY'
      if (!row.ok) anyBad = true
      console.log(`${screen} · ${row.id} · line ${row.line} · ${status}`)
    }
  }
  if (anyBad) {
    console.log('\nSome checkReq blocks only assert existence (toBeVisible/toBeAttached/toHaveCount(0)) —')
    console.log('a requirement they "prove" would stay green with its substance deleted. Strengthen the')
    console.log('assertion to check an actual value (kg-e2e rule 2).')
  }
  // …and then the AUTHORED INTENT (phase 6): the existence rows above ask whether each proof reads a
  // value; these ask whether it reads the values the requirement's own Then names.
  let anyGap = false
  console.log('')
  for (const screen of screenDirs()) {
    const prd = join('spec', screen, 'prd.md')
    const spec = join('spec', screen, 'test.spec.ts')
    if (!existsSync(prd) || !existsSync(spec)) continue
    for (const row of lintIntent(readFileSync(prd, 'utf8'), readFileSync(spec, 'utf8'), { screen, helpers })) {
      if (row.state === 'no-beat') {
        console.log(`${screen} · ${row.id}${row.beat ? ' · beat ' + row.beat : ''} · no-beat · ${row.why}`)
        continue
      }
      // the requirement-level row: its checkReq blocks do not walk its beats (fix round 2)
      if (row.state === 'beat-mismatch') {
        anyGap = true
        console.log(`${screen} · ${row.id} · BEAT-MISMATCH`)
        console.log(`    ${row.why}`)
        continue
      }
      if (!row.ok) anyGap = true
      const verdict = row.state === 'declared' ? 'DECLARED' : (row.ok ? 'ok' : 'INTENT-GAP')
      console.log(`${screen} · ${row.id} · beat ${row.beat} · ${row.facts} facts · ${row.claims} claims (${row.soft} soft) · ${verdict}`)
      if (row.state !== 'ok') console.log(`    ${row.why}`)
    }
  }
  if (anyGap) {
    console.log('\nA Then names a fact no claim covers. Every fact a requirement states is a SOFT claim —')
    console.log("proveVisible(target, expected, label, { soft: true }) — so the beat reaches and photographs")
    console.log('every one of them and fails once at its end with the whole list. Add the missing claim on the')
    console.log('very element the Then names; never edit the Then to fit the test (rule 5 — meaning is the')
    console.log("human's), and never drop a fact that cannot be read off the screen: DECLARE it —")
    console.log("intentGap('<why this fact has no screen surface>') in the beat — which prints as DECLARED")
    console.log('and is a visible debt, never a pass. A fact that names an ABSENCE is claimable and may not')
    console.log('be declared: proveVisible(locator, MISSING, label, { soft: true }) passes exactly while the')
    console.log('thing is gone and fails, with the app\'s own text, the moment it is back.')
  }
  process.exit(anyBad || anyGap ? 1 : 0)
}

// Recursively collect every `proves <id>` step out of the `--reporter=json` report's suite/spec/test/
// result/step tree, each as { id, passed }. The JSON reporter's step shape mirrors what
// spec/_results-reporter.mjs already reads off Playwright's live Suite/Test objects (title, error,
// nested steps) — same shape, different serialization.
function collectProvesSteps (node, out = []) {
  if (!node || typeof node !== 'object') return out
  for (const s of node.suites || []) collectProvesSteps(s, out)
  for (const s of node.specs || []) collectProvesSteps(s, out)
  for (const t of node.tests || []) collectProvesSteps(t, out)
  for (const r of node.results || []) walkSteps(r.steps, out)
  return out
}
function walkSteps (steps, out) {
  for (const s of steps || []) {
    const m = /^proves\s+(\S+)/.exec(String(s?.title || ''))
    if (m) out.push({ id: m[1], passed: !s.error })
    if (s?.steps?.length) walkSteps(s.steps, out)
  }
}

// The mirror gate's shell (thin, like runLint above — checkMirrors is what the unit tests exercise).
function runMirror () {
  const rows = checkMirrors('spec')
  let bad = false
  for (const r of rows) {
    if (!r.ok) bad = true
    console.log(`${r.screen} · ${r.id} · ${r.ok ? 'ok' : 'MIRROR BROKEN'}${r.why ? ' · ' + r.why : ''}`)
    for (const g of r.gaps.slice(0, 12)) {
      console.log(`    frame ${g.frame} · ${g.kind} · ${g.what} · at ${g.x},${g.y} ${g.w}×${g.h} (page px)`)
    }
    if (r.gaps.length > 12) console.log(`    …and ${r.gaps.length - 12} more`)
  }
  // Since phase 4a (2026-09-03) NONE is the healthy answer: a harvested requirement's picture is
  // its HTML replica, gated below, and no wireframe is derived or kept for one. This line is the
  // gate saying which guard is actually standing, not an apology for an empty pass.
  if (!rows.length) console.log('no committed wireframe drawings — replicas gated instead')
  if (bad) {
    console.log('\nA committed picture no longer matches the harvest it was measured against. Re-derive it')
    console.log('(node tools/viz-derive.mjs <screen>); if the gaps survive the redraw, the renderer has')
    console.log('stopped drawing something the app measured — fix that, never the guard.')
  }
  // …and the REPLICAS, in the same format after the drawings (phase 3, 2026-09-03): the row's other
  // picture is gated the same way, and for the same reason.
  const reps = checkReplicas('spec')
  let repBad = false
  for (const r of reps) {
    if (!r.ok) repBad = true
    console.log(`${r.screen} · ${r.id} · ${r.side} · ${r.ok ? 'ok' : 'REPLICA GAP'}${r.why ? ' · ' + r.why : ''}`)
    for (const g of r.gaps.slice(0, 12)) {
      console.log(`    ${g.kind} · ${g.what} · at ${g.x},${g.y} ${g.w}×${g.h} (viewport px)`)
    }
    if (r.gaps.length > 12) console.log(`    …and ${r.gaps.length - 12} more`)
  }
  if (!reps.length) console.log('no replicas — nothing to gate yet')
  if (repBad) {
    console.log('\nA committed replica is not the picture the harvest measured. Re-harvest the screen; if')
    console.log('the gaps survive it, the CAPTURE has stopped carrying something the app shows — fix that,')
    console.log('never the tolerance and never the guard.')
  }
  process.exit(bad || repBad ? 1 : 0)
}

function runPerturb (screen) {
  if (!screen) {
    console.error('usage: node tools/proof-integrity.mjs perturb <screen>')
    process.exit(2)
  }
  const goldenPath = join('spec', screen, 'golden.json')
  if (!existsSync(goldenPath)) {
    console.log('no-golden')
    process.exit(2)
  }
  const backupPath = goldenPath + '.pi-bak'
  copyFileSync(goldenPath, backupPath)
  try {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))
    const { value, changes } = perturbNumbers(golden)
    if (!changes.length) {
      console.log(`no numeric leaves found in ${goldenPath} — nothing to perturb`)
      return
    }
    writeFileSync(goldenPath, JSON.stringify(value, null, 2) + '\n')
    console.log(`perturbed ${changes.length} numeric value(s) in ${goldenPath}:`)
    for (const c of changes) console.log(`  ${c.path}: ${c.from} → ${c.to}`)

    // Which checkReq blocks in this screen's spec make a real value assertion — a proof with no
    // value assertion cannot be a SUSPECT here; lint already flagged it as existence-only.
    const testPath = join('spec', screen, 'test.spec.ts')
    const src = existsSync(testPath) ? readFileSync(testPath, 'utf8') : ''
    const valueAsserted = new Map(extractCheckReqBlocks(src).map(b => [b.id, hasValueAssertion(b.body)]))

    // --reporter=json REPLACES the config's reporter array (see playwright.board.ts) — the custom
    // spec/_results-reporter.mjs does not run, so this perturbed run can never fold into
    // spec/_results-index.json. That is the whole safety property this command depends on.
    const scratch = join(tmpdir(), `proof-integrity-${screen}-${Date.now()}.json`)
    let stdout
    try {
      stdout = execFileSync(
        'npx',
        ['playwright', 'test', `spec/${screen}`, '--config=playwright.board.ts', '--reporter=json'],
        { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }
      )
    } catch (err) {
      // A red run under perturbation is often the DESIRED outcome — Playwright exits non-zero on any
      // failure, but the JSON report is still on stdout and still worth reading.
      stdout = String(err.stdout || '')
    }
    writeFileSync(scratch, stdout)
    console.log(`\nrun report captured → ${scratch}`)

    let report
    try { report = JSON.parse(stdout) } catch {
      console.log('could not parse the JSON report — see the scratch file above')
      return
    }
    const proves = collectProvesSteps(report)
    if (!proves.length) {
      console.log('no `proves <id>` steps found in the report')
      return
    }
    for (const p of proves) {
      if (p.passed && valueAsserted.get(p.id)) {
        console.log(`${screen} · ${p.id} · SUSPECT — proof survived a perturbed golden`)
      } else if (p.passed) {
        console.log(`${screen} · ${p.id} · passed under perturbation, but is existence-only (lint already flags it)`)
      } else {
        console.log(`${screen} · ${p.id} · went red under perturbation (good — the proof is real)`)
      }
    }
  } finally {
    // Golden restore is unconditional — a perturbed golden left on disk would poison every run after
    // this one, so it comes back even if the run above threw for an unrelated reason.
    copyFileSync(backupPath, goldenPath)
    unlinkSync(backupPath)
  }
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const [, , cmd, arg] = process.argv
  if (cmd === 'lint') runLint()
  else if (cmd === 'mirror') runMirror()
  else if (cmd === 'perturb') runPerturb(arg)
  else {
    console.error('usage:')
    console.error('  node tools/proof-integrity.mjs lint')
    console.error('  node tools/proof-integrity.mjs mirror')
    console.error('  node tools/proof-integrity.mjs perturb <screen>')
    process.exit(2)
  }
}
