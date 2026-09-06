// THE READER-COMPOSITION PASS — does the board draw the moment where the harvest says it is?
//
// `npm run proof mirror` already proves each replica is faithful TO THE APP: the gate walks the
// app's own unedited tree back in a hidden frame at capture time and every box and word the live
// skeleton measured must come back (spec/_moment.mjs gateInPage, tools/replica-gate.mjs). That is
// one half of the question. The other half — the half nothing proved — is whether the READER, which
// composes that file into an `<iframe srcdoc>` with a sheet of its own laid over it, renders the
// marked element where the capture recorded it.
//
// It does not get that for free, and it has already got it wrong. The board's sheet has to reach
// INTO the app's markup to draw a claim's tint and its ✓/✎/↺/+ glyph, and the replica's own sheet
// sits later in the document — so those rules are written with the attribute repeated to win the
// tie. Written that way for `position` (which is layout, not paint) they moved the app's markup:
// demo/todo R3 and R4 ring a sub-task counter the app places `absolute; inset:0` over its 26×26
// button, the tripled rule forced it `relative`, it fell into the button's flow, and the ring sat
// 29 px above the number it marks in EVERY moment of both requirements. `proof mirror` was green on
// exactly those files, because the in-page gate walks the replica with NO board sheet over it: that
// drift exists only where a reader looks at it. The reader's sheet must keep reaching into app
// markup to tint, so the class will recur; hence a gate for the class rather than a fix for the one.
//
// WHAT IS CHECKED, per harvested moment:
//   1. the moment is composed EXACTLY as the board composes it — `SBGraft.graft` + `stand`, the
//      srcdoc sheet from `repSrcdoc`, the ring layer, the shell plates, the screen's faces — with the
//      reader's own bytes lifted out of tools/board/client.js rather than restated here (a gate that
//      restates the reader's rules drifts from them, which IS the defect it exists to catch);
//   2. the element the capture rang is measured in that laid-out document, and its offset INSIDE ITS
//      OWN REPLICA ROOT must be the offset the capture recorded (`data-ring-box` against
//      `data-replica-region`, converted by `stand`), within PLACE_TOL. Normalising by the replica's
//      own root is what keeps a graft honest: a patch spliced into the base's flow legitimately
//      lands somewhere else on the page — that is what the align pass is for — but nothing may move
//      it INSIDE the component it is a picture of;
//   3. the reader's own align pass is then run (`repAlignIn`, its real bytes) and its verdict
//      recorded. An alignment it REFUSED — a `position:fixed` element a rigid page translation
//      cannot move — is neither a silent pass nor a red row: it is a listed debt, printed the way
//      the lint prints a DECLARED intent gap (rule 3: honesty over green).
//
// A moment with nothing to place — no `data-ring-box` (every Given base: nothing was asserted on it)
// — is counted and not failed; a legacy moment with no composable data keeps today's behaviour,
// listed, never failed.
//
// The pure parts (composeRows, readerBundle, classify) are unit-tested with no browser; the browser
// pass gets its own real test with the shipped defect put back (tools/reader-compose.test.mjs).
import { readFileSync } from 'node:fs'
import { lift } from './lift-client.mjs'
import { momentsOf, readSrc, designCss, readResults } from './spec-store.mjs'
import { paperCssOf } from './build-board.mjs'
import { RING } from './overlay-geometry.mjs'

// The landing tolerance, in the moment's own page pixels. The reader's align pass already treats a
// half-pixel as no shift at all and verifies its own landing at 1.5 px (tools/board/graft.js
// `alignTo`, client.js `repAlignIn`), so this sits just above both: anything a reader could see is
// caught, and sub-pixel rounding between one layout and the next is not a finding. WHEN A REAL
// HARVEST SHOWS A GAP, FIX THE READER — never this number.
export const PLACE_TOL = 2

const CLIENT_PATH = new URL('./board/client.js', import.meta.url)
const GRAFT_PATH = new URL('./board/graft.js', import.meta.url)

// ── WHICH MOMENTS A READER COMPOSES ──────────────────────────────────────────────────────────────
// The viewport a beat's replica stands on, exactly as the reader's `viewportOf` reads it: the beat's
// own, else any other beat of the requirement — never invented, because a replica at the wrong page
// size is a picture of a different screen.
function vpFrom (b) {
  if (b && b.vw > 0 && b.vh > 0) return { vw: b.vw, vh: b.vh }
  const f = b && (b.focus || b.aimAfter || b.aimBefore)
  return (f && f.vw > 0 && f.vh > 0) ? { vw: f.vw, vh: f.vh } : null
}
function vpOf (entry, beat) {
  let vp = vpFrom(beat)
  for (const o of (entry.beats || [])) { if (vp) break; vp = vpFrom(o) }
  return vp
}

// Pure: the fold → one row per moment a reader would compose. The BASE rides on every moment of its
// beat (client.js `pair`), and the beat's opening moment IS that base — body-rooted, so it paints
// alone with nothing to graft onto. Everything else is a patch on it.
export function composeRows (index) {
  const rows = []
  for (const screen of Object.keys(index || {}).filter(s => !s.startsWith('_')).sort()) {
    const ev = (index[screen] && index[screen].evidence) || {}
    for (const [id, entry] of Object.entries(ev)) {
      for (const b of (entry && Array.isArray(entry.beats) ? entry.beats : [])) {
        if (!b) continue
        const vals = (Array.isArray(b.values) ? b.values : []).filter(Boolean)
        let k = 0
        for (const m of momentsOf({ beats: [b] })) {
          // WHICH CLAIM THIS MOMENT IS THE PICTURE OF — only so the ring is painted in the colour the
          // reader would paint it (`ok: !failedClaims(sh).length`, client.js). It moves no geometry;
          // it is here so what this gate composes is the reader's page and not a near one.
          const claim = m.phase === 'value' ? (vals[k++] || {}).claim : null
          const ok = m.phase === 'after'
            ? !vals.some(v => v.claim && v.claim.ok === false)
            : !(claim && claim.ok === false)
          if (!m.replica) continue
          rows.push({
            screen,
            id,
            beat: Number(b.n) || 1,
            phase: m.phase,
            rep: m.replica,
            base: m.kind === 'base' ? '' : (b.base || ''),
            layout: m.layout || '',
            faces: (entry && entry.fontFaces) || '',
            ok,
            vp: vpOf(entry, b)
          })
        }
      }
    }
  }
  return rows
}

// ── THE READER'S OWN BYTES, IN A PAGE ────────────────────────────────────────────────────────────
// Everything the Expected cell composes with, lifted verbatim: the graft module as it ships, and the
// replica helpers out of client.js. `repPlates` reads two caps declared beside it, so those are read
// out of the same source rather than copied — one place, always.
const HELPERS = ['repAttr', 'repRect', 'repScroll', 'repStand', 'repPlates', 'repBody', 'repSrcdoc', 'repAlignIn']

function constOf (src, name) {
  const m = new RegExp('\\bconst ' + name + ' = ([^\\n]+)').exec(src)
  if (!m) throw new Error('no const ' + name + ' in client.js — it was renamed or removed')
  return m[1].replace(/\s*$/, '')
}

export function readerBundle (clientSrc, graftSrc, paper, ring) {
  const body = HELPERS.map(n => lift(clientSrc, n)).join('\n;\n')
  return graftSrc + '\n;(function () {\n' +
    'var PAPER = ' + JSON.stringify(paper) + ';\n' +
    'var RINGG = ' + JSON.stringify(ring) + ';\n' +
    'var PLATE_FRAC = ' + constOf(clientSrc, 'PLATE_FRAC') + '\n' +
    'var PLATE_MAX = ' + constOf(clientSrc, 'PLATE_MAX') + '\n' +
    body + '\n;window.__RC__ = {' + HELPERS.map(n => n + ': ' + n).join(', ') + '};\n})();'
}

// ── THE VERDICT ──────────────────────────────────────────────────────────────────────────────────
// Pure, so what counts as a finding is decided apart from the browser that measures it.
//   ok           the marked element renders where the harvest recorded it
//   off          it does not — a FAILING row
//   refused      the reader could not place this moment honestly (a fixed-position element a rigid
//                page translation cannot move): a listed DEBT, never a red row and never a silent pass
//   unplaceable  a ring was recorded but the composed page carries no `data-ring` element to put
//                under it — listed, so a ring painted on nothing is visible
//   unringed     nothing was asserted on this moment (every Given base) — there is no placement to
//                check, so it is counted and not listed
//   legacy       no viewport, or bytes that would not read — today's behaviour, listed, not failed
export function classify (m) {
  if (!m || m.kind === 'legacy') return { status: 'legacy', why: (m && m.why) || 'nothing composable' }
  if (!m.ring) return { status: 'unringed', why: 'no ring recorded — nothing to place' }
  if (m.repalign === 'refused') {
    return { status: 'refused', why: 'the reader refused its own shift — the ringed element does not travel with the page' }
  }
  if (!m.got || !m.want) return { status: 'unplaceable', why: 'a ring was recorded but no data-ring element stands in the composed page' }
  const dx = m.got.x - m.want.x
  const dy = m.got.y - m.want.y
  if (Math.abs(dx) > PLACE_TOL || Math.abs(dy) > PLACE_TOL) {
    return {
      status: 'off',
      dx,
      dy,
      why: 'the reader draws the marked element ' + Math.round(dx) + ',' + Math.round(dy) +
        ' px from its ring inside its own component — the composed page moved the app\'s markup'
    }
  }
  return { status: 'ok', dx, dy, why: '' }
}

// ── THE BROWSER PASS ─────────────────────────────────────────────────────────────────────────────
// ONE browser, ONE page, one iframe per moment: the composition is the cost, not the launch, and a
// couple of hundred moments has to stay inside a couple of minutes for anyone to run this gate.
// Identical compositions are measured ONCE — a screen's base is shared by every beat that opens on
// it, so the same bytes at the same viewport are the same answer.
function measureInPage (a) {
  const RC = window.__RC__
  const G = window.SBGraft
  const rep = a.rep
  const body = RC.repBody(rep)
  if (!body) return Promise.resolve({ kind: 'legacy', why: 'the committed picture would not read' })
  const path = RC.repAttr(rep, 'data-replica-path')
  const ns = RC.repAttr(rep, 'data-replica-ns')
  const ring = RC.repRect(rep, 'data-ring-box')
  const region = RC.repRect(rep, 'data-replica-region')
  const sc = RC.repScroll(rep)
  const fallback = { x: 0, y: 0, w: a.vw, h: a.vh }
  // THE MOMENT'S OWN FRAME, whatever page it ends up standing in: where the capture says the ringed
  // element sits INSIDE its own scene root. `stand` with the moment's own scroll on both sides is
  // exactly the lone-patch conversion, which is the replica read in its own coordinates.
  const own = (region && G.stand({ whole: !path, region: region, scroll: sc, moment: sc })) || fallback
  const want = ring ? { x: ring.x - own.x, y: ring.y - own.y } : null

  let doc = null
  let stood = null
  let grafted = false
  let why = ''
  const baseHtml = a.base ? RC.repBody(a.base) : ''
  if (a.base && path && baseHtml) {
    const p = new DOMParser().parseFromString('<div id="b">' + baseHtml + '</div><div id="p">' + body + '</div>', 'text/html')
    const baseRoot = p.querySelector('#b > .rep')
    const patchRoot = p.querySelector('#p > .rep')
    const g = (baseRoot && patchRoot) ? G.graft(baseRoot, patchRoot, path) : { ok: false, why: 'no replica root' }
    if (g.ok) {
      grafted = true
      const styles = Array.prototype.map.call(p.querySelectorAll('style'), function (s) { return s.outerHTML }).join('')
      stood = G.stand({
        whole: !RC.repAttr(a.base, 'data-replica-path'),
        region: RC.repRect(a.base, 'data-replica-region'),
        scroll: RC.repScroll(a.base),
        moment: sc
      }) || fallback
      doc = RC.repSrcdoc({ body: styles + baseRoot.outerHTML, faces: a.faces || '', plates: [],
        region: stood, ring: ring, ok: a.ok !== false, vw: a.vw, vh: a.vh })
    } else why = g.why
  }
  if (!doc) {
    // the lone picture — a legacy harvest, a body-rooted moment (which IS the whole page already), or
    // a graft the base could not take. Exactly what the reader falls back to.
    stood = own
    doc = RC.repSrcdoc({ body: body, faces: a.faces || '', plates: path ? RC.repPlates(a.lay, region, a.vw, a.vh) : [],
      region: stood, ring: ring, ok: a.ok !== false, vw: a.vw, vh: a.vh })
  }

  return new Promise(function (res) {
    const f = document.createElement('iframe')
    // the reader's own frame, at the page's own size: it scales the frame with a CSS transform, which
    // moves no layout, so the natural size is the honest one to measure in
    f.setAttribute('sandbox', 'allow-same-origin')
    f.style.cssText = 'position:absolute;left:0;top:0;border:0;width:' + a.vw + 'px;height:' + a.vh + 'px'
    f.addEventListener('load', function () {
      let out
      try {
        const d = f.contentDocument
        const wrapper = d.getElementById('sbstand')
        const nsOk = /^[A-Za-z0-9_-]+$/
        const scope = (ns && nsOk.test(ns) && d.querySelector('[data-replica-ns="' + ns + '"]')) || wrapper
        const el = scope && G.ringTarget(scope)
        const rootBox = scope && scope.getBoundingClientRect()
        const elBox = el && el.getBoundingClientRect()
        const got = (elBox && rootBox && (elBox.width > 0 || elBox.height > 0))
          ? { x: elBox.left - rootBox.left, y: elBox.top - rootBox.top }
          : null
        // …and then THE READER'S OWN ALIGN PASS, its real bytes, on the real document
        const repalign = RC.repAlignIn(d, { ring: ring, stood: stood, ns: ns })
        out = { kind: 'measured', want: want, got: got, ring: ring, grafted: grafted, why: why,
          repalign: repalign == null ? '' : repalign }
      } catch (e) {
        out = { kind: 'legacy', why: 'the composed document could not be read: ' + String(e && e.message || e) }
      }
      f.remove()
      res(out)
    })
    f.srcdoc = doc
    document.body.appendChild(f)
  })
}

export async function checkReaderCompose (index = readResults(), opts = {}) {
  const read = opts.read || readSrc
  const clientSrc = opts.clientSrc || readFileSync(CLIENT_PATH, 'utf8')
  const graftSrc = opts.graftSrc || readFileSync(GRAFT_PATH, 'utf8')
  const rows = composeRows(index)
  if (!rows.length) return []

  const paper = opts.paper || paperCssOf(designCss())
  const boot = readerBundle(clientSrc, graftSrc, paper, RING)

  const { chromium } = await import('playwright')
  const browser = await (opts.launch ? opts.launch() : chromium.launch())
  const out = []
  const seen = new Map()                 // identical compositions are measured once
  const bytes = new Map()                // …and identical srcs are read once
  const readOnce = async (src) => {
    if (!src) return ''
    if (!bytes.has(src)) {
      let t = ''
      try { const b = await read(src); t = b ? String(b) : '' } catch { t = '' }
      bytes.set(src, t)
    }
    return bytes.get(src)
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.setContent('<!doctype html><html><body style="margin:0"></body></html>')
    await page.addScriptTag({ content: boot })
    for (const row of rows) {
      const r = { ...row, status: 'legacy', why: '', repalign: '', dx: 0, dy: 0 }
      out.push(r)
      if (!row.vp) { r.why = 'no viewport recorded for this beat — the reader shows no picture at all'; continue }
      const rep = await readOnce(row.rep)
      if (!rep) { r.why = 'the picture is gone — nothing answers ' + row.rep; continue }
      const key = row.rep + '|' + row.base + '|' + row.layout + '|' + row.faces + '|' + row.vp.vw + 'x' + row.vp.vh + '|' + row.ok
      let m = seen.get(key)
      if (!m) {
        const base = await readOnce(row.base)
        let lay = null
        const layText = await readOnce(row.layout)
        if (layText) { try { lay = JSON.parse(layText) } catch { lay = null } }
        m = await page.evaluate(measureInPage, {
          rep, base, lay, faces: await readOnce(row.faces),
          vw: row.vp.vw, vh: row.vp.vh, ok: row.ok !== false
        })
        seen.set(key, m)
      }
      const v = classify(m)
      r.status = v.status
      r.why = v.why || m.why || ''
      r.dx = v.dx || 0
      r.dy = v.dy || 0
      r.repalign = m.repalign || ''
      r.grafted = !!m.grafted
      r.ring = m.ring || null
    }
  } finally {
    await browser.close()
  }
  return out
}
