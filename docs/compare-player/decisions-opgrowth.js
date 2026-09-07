/* decisions-opgrowth.js — the five decisions on dojostack's blanket Operation Growth page as DATA for
 * compare-player. Every fact here was read on 2026-09-07 from the doc (SD-07, LIVE_FRESHNESS_AND_FREEZE),
 * the code (frontend grid, backend resolve/save), the board's spec (R1–R12) and today's photographs.
 * Images come from window.IMG (images-opgrowth.js / .json). */
/* global IMG */
const PAGE = {
  title: 'Blanket Operation Growth — five decisions, played',
  sub: 'property 523 · <b>one beat per decision</b>, drawn once per source and driven by one stepper · the ringed cell is where the sources differ · <b>auto</b> plays and advances, <b>semi-auto</b> replays the moment and waits, <b>step</b> is still'
}

const C6 = ['Line Item', 'Method / Selection', 'Long Term', '2026', '2027', '2028']
const W6 = '1.1fr 1.25fr .95fr .85fr .85fr .85fr'
const C4 = ['Line Item', 'Method / Selection', 'Long Term', '2026']
const W4 = '1.1fr 2.6fr .9fr .9fr'
const CY = ['Line Item', 'Long Term', '2027', '2028']
const WY = '1.2fr 1fr .9fr .9fr'
const CR = ['#', 'Line Item', 'Assumption', '2026 Budget']
const WR = '.35fr 1.8fr 2fr 1.1fr'
const c = (v, face, ring, extra) => Object.assign({ v, face: face || '', ring: !!ring }, extra || {})
const sel = (html, ring) => ({ html, face: 'sel', ring: !!ring })
const grid = (cols, widths, cells, extra) => Object.assign({ kind: 'grid', cols, widths, rows: [{ cells }] }, extra || {})
const img = (shots) => ({ kind: 'img', shots })
const empty = (text) => ({ kind: 'empty', text })
const RM = 'Repair & M…', PMF = 'PM Fee'
const rm6 = (lta, y, opt) => grid(C6, W6, [c(RM), sel('Growth Rate — Input'), lta, y[0], y[1], y[2]], opt)

const HDR_BOX = { l: 57, t: 4, w: 42, h: 92 }
const LTA_BOX = { l: 39.6, t: 0, w: 11.4, h: 100 }, YRS_BOX = { l: 67.5, t: 0, w: 32.5, h: 100 }

const DECISIONS = [
  // ---------------------------------------------------------------- D1
  {
    id: 'D1', question: 'Follow or pin? After House View publishes a new 5% for Repair &amp; Maintenance, what does draft 587 show?', badge: 'R2 · R8',
    words: { given: 'draft 587 on House View FY30/31 Aug 2030 — Repair &amp; Maintenance inherits 4%', when: 'House View publishes a <b>new 5%</b> for Repair &amp; Maintenance', thens: ['the Long Term cell reads the new rate', 'every year cell reads the new rate'] },
    moments: ['Given · R&M inherits 4%', 'When · House View publishes 5%', 'Then · the Long Term cell', 'Then · the year cells'],
    sources: [
      { id: 'spec', kind: 'spec', label: 'SPEC says', short: 'SPEC', sub: 'R2 "moves when House View moves" · R8 "the property picks it up"',
        scenes: [
          rm6(c('4.00%', 'inh'), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')], { chip: { text: 'Published · <b>FY30/31 Aug 2030</b>', tag: 'following' } }),
          rm6(c('4.00%', 'inh'), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')], { chip: { text: 'Published · <b>May 2032</b>', tag: 'live · followed' }, when: { type: 'pulse', target: 'chip' } }),
          rm6(c('5.00%', 'inh', true), [c('5.00%', 'inh'), c('5.00%', 'inh'), c('5.00%', 'inh')], { chip: { text: 'Published · <b>May 2032</b>', tag: 'live · followed' } }),
          rm6(c('5.00%', 'inh'), [c('5.00%', 'inh', true), c('5.00%', 'inh', true), c('5.00%', 'inh', true)], { chip: { text: 'Published · <b>May 2032</b>', tag: 'live · followed' } })
        ],
        notes: ['no pin: the draft resolves whatever House View is live', 'the chip flips to the new live version by itself', 'Long Term reads 5.00%, still green', 'every year reads 5.00% — "inheritance is a live link"'] },
      { id: 'doc', kind: 'doc', label: 'DOC = CODE', short: 'DOC = CODE', sub: 'REQ-HV-FOLLOW-10 (08-22) · pin-by-default (08-13) · version.py:2259',
        scenes: [
          rm6(c('4.00%', 'inh'), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')], { chip: { text: 'Published · <b>FY30/31 Aug 2030</b>', tag: 'pinned' } }),
          rm6(c('4.00%', 'inh'), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')], { chip: { text: 'Published · <b>FY30/31 Aug 2030</b>', warn: true, tag: 'newer available', ring: true }, when: { type: 'pulse', target: 'chip' } }),
          rm6(c('4.00%', 'inh', true), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')], { chip: { text: 'Published · <b>FY30/31 Aug 2030</b>', warn: true, tag: 'newer available' } }),
          rm6(c('4.00%', 'inh'), [c('4.00%', 'inh', true), c('4.00%', 'inh', true), c('4.00%', 'inh', true)], { chip: { text: 'Published · <b>FY30/31 Aug 2030</b>', warn: true, tag: 'newer available' } })
        ],
        notes: ['every create path stamps a pin; NULL is only the explicit "follow" choice', 'the draft keeps its version and shows ⚠ — "a property NEVER moves by any automatic path"', 'Long Term still 4.00%', 'every year still 4.00%; only a person moves the pin (change-house-view)'] },
      { id: 'act', kind: 'act', label: 'ACTUAL', short: 'ACTUAL', sub: 'photographed today · API house_view_version_id 269 · current 448',
        scenes: [
          img([{ src: IMG.g_header }, { src: IMG.g_rm_row }]),
          img([{ src: IMG.g_header, boxes: [HDR_BOX] }, { src: IMG.g_rm_row }]),
          img([{ src: IMG.g_header }, { src: IMG.g_rm_row, boxes: [LTA_BOX] }]),
          img([{ src: IMG.g_header }, { src: IMG.g_rm_row, boxes: [YRS_BOX] }])
        ],
        notes: ['pinned to FY30/31 Aug 2030 · R&M 4.00%', 'the org\'s live version is v448 (May 2032); the chip shows ⚠', 'Long Term 4.00% — R2\'s assertion "resolves the LIVE version" failed here today', 'every year 4.00%'] }
    ],
    options: [{ title: 'A · keep R2/R8, make 523 an explicit follower in the fixture', fails: 'proves the follow path only; a fresh draft is pinned and R2 says nothing about it' }, { title: 'B · reword to pin-by-default', fails: 'the live-link idea leaves the board' }],
    recommend: 'A + one new requirement for the pinned default and the adopt action'
  },
  // ---------------------------------------------------------------- D2
  {
    id: 'D2', question: 'What does "override a line\'s growth" mean? You want Repair &amp; Maintenance at 6% instead of House View\'s 4%.', badge: 'R3 · R7 · R9',
    words: { given: 'Repair &amp; Maintenance inherits 4% in every cell', when: 'you <b>type 6%</b> for Repair &amp; Maintenance and save', thens: ['the cell you typed carries the override', 'the other cells'] },
    moments: ['Given · 4% everywhere', 'When · you type 6%', 'Then · the cell you typed', 'Then · the other years'],
    sources: [
      { id: 'spec', kind: 'spec', label: 'SPEC says', short: 'SPEC', sub: 'R3 "editing a line\'s growth … and saving pins that value" · the test posts adopted: 0.06',
        scenes: [
          rm6(c('4.00%', 'inh'), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')]),
          rm6(c('6.00%', 'typed'), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')], { when: { type: 'type', cell: [0, 2], from: '4.00%', text: '6.00%' } }),
          rm6(c('6.00%', 'ovl', true), [c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')]),
          rm6(c('6.00%', 'ovl'), [c('6.00%', 'ovl', true), c('6.00%', 'ovl', true), c('6.00%', 'ovl', true)])
        ],
        notes: ['', 'the Long Term cell is where you type', 'Long Term carries the 6% override', 'every un-pinned year follows the new Long Term (R9)'] },
      { id: 'doc', kind: 'doc', label: 'DOC = CODE', short: 'DOC = CODE', sub: 'REQ-CELL-LTA-01 (owner 08-06) · adoptedColumnMode="reference" · save drops adopted',
        scenes: [
          grid(C6, W6, [c(RM), sel('Growth Rate — Input'), c('🔒 4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'inh'), c('4.00%', 'inh')]),
          grid(C6, W6, [c(RM), sel('Growth Rate — Input'), c('🔒 4.00%', 'lock'), c('4.00%', 'inh'), c('6.00%', 'typed'), c('4.00%', 'inh')], { when: { type: 'type', cell: [0, 4], from: '4.00%', text: '6.00%' } }),
          grid(C6, W6, [c(RM), sel('Growth Rate — Input'), c('🔒 4.00%', 'lock', true), c('4.00%', 'inh'), c('6.00%', 'ovl', true), c('4.00%', 'inh')]),
          grid(C6, W6, [c(RM), sel('Growth Rate — Input'), c('🔒 4.00%', 'lock'), c('4.00%', 'inh', true), c('6.00%', 'ovl'), c('4.00%', 'inh', true)])
        ],
        notes: ['the Long Term column is House View\'s — "read-only" in its own header', 'the Long Term cell refuses keys and paste; you type into a YEAR', '2027 carries a pin; Long Term stays locked at 4.00%', 'the other years still inherit 4.00% — a pin is per year (or a span)'] },
      { id: 'act', kind: 'act', label: 'ACTUAL', short: 'ACTUAL', sub: 'photographed today',
        scenes: [
          img([{ src: IMG.g_rm_row }]),
          img([{ src: IMG.g_lta_head, w: '42%', boxes: [{ l: 2, t: 2, w: 96, h: 96 }] }]),
          img([{ src: IMG.g_rm_row, boxes: [LTA_BOX] }]),
          img([{ src: IMG.g_rm_row, boxes: [YRS_BOX] }])
        ],
        notes: ['4.00% in every cell, green', 'the header itself says "House View · read-only" — the When cannot be performed on this cell', 'not performed: the tests reach the scalar only through the API, on the one Input-pegged line the backend still accepts it for', 'years 4.00%'] }
    ],
    options: [{ title: 'A · keep the scalar lever (API only)', fails: 'the board proves a gesture no user can make' }, { title: 'B · re-lever R3/R7/R9 to year cells', fails: 'R9\'s "saved Long Term rate" step loses its author and must go' }],
    recommend: 'B — the owner already decided; the spec is the stale side'
  },
  // ---------------------------------------------------------------- D3a
  {
    id: 'D3a', question: 'Taking a fee\'s method over — what marks it? (R5)', badge: 'R5',
    words: { given: 'Property Management Fee follows House View: Ratio — % of Revenue', when: 'you <b>tick Base Amount and untick % of Revenue</b> in the Method / Selection cell', thens: ['the Method cell shows the takeover', 'the API stores it'] },
    moments: ['Given · follows House View', 'When · you change the method', 'Then · the Method cell', 'Then · what the API stores'],
    sources: [
      { id: 'spec', kind: 'spec', label: 'SPEC says', short: 'SPEC', sub: 'R5 grounded on method_severed=true · method_owner="blanket"',
        scenes: [
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')]),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')], { when: { type: 'pulse', target: [0, 1] } }),
          grid(C4, W4, [c(PMF), sel('Growth Rate <span class="pill2">Standalone</span>', true), c('—', 'ghost'), c('—', 'ghost')]),
          grid(C4, W4, [c(PMF), sel('Growth Rate <span class="pill2">Standalone</span>'), c('—', 'ghost'), c('—', 'ghost')], { flag: '<span class="k">method_severed: true · method_owner: "blanket"</span>', flagRing: true })
        ],
        notes: ['', 'the Method popover', 'the whole line is cut loose: "Standalone"', 'a whole-line switch on the row'] },
      { id: 'doc', kind: 'doc', label: 'DOC = CODE', short: 'DOC = CODE', sub: '§3.4.7(1) D2=A (08-22) · entity_component_diff.py:529 · frontend reads removed 08-31',
        scenes: [
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')]),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')], { when: { type: 'pulse', target: [0, 1] } }),
          grid(C4, W4, [c(PMF), sel('Growth Rate <s>% of Revenue</s> ↺', true), c('—', 'ghost'), c('—', 'ghost')], { flag: '<span class="badge2">Overlays 1</span>' }),
          grid(C4, W4, [c(PMF), sel('Growth Rate <s>% of Revenue</s> ↺'), c('—', 'ghost'), c('—', 'ghost')], { flag: '<span class="badge2">Overlays 1</span> <span class="k">method_severed: false</span> (always)', flagRing: true })
        ],
        notes: ['', 'the same popover — a peg multi-select', 'per part: the struck House View peg, the ↺ arrow, the Overlays count', 'no whole-line switch: the backend ignores a posted flag and always serves false'] },
      { id: 'act', kind: 'act', label: 'ACTUAL', short: 'ACTUAL', sub: 'photographed today · fixture not taken over',
        scenes: [
          img([{ src: IMG.g_method, w: '70%' }]),
          img([{ src: IMG.g_method, w: '70%', boxes: [{ l: 1, t: 2, w: 98, h: 96 }] }]),
          img([{ src: IMG.g_method, w: '70%', boxes: [{ l: 1, t: 2, w: 98, h: 96 }] }]),
          { kind: 'html', html: '<div class="flag ring"><span class="k">method_severed: false</span> served on every row today</div>' }
        ],
        notes: ['Ratio — % of Revenue, following House View', 'the popover is the merged cell\'s (not performed on the fixture)', 'not performed — the marker the spec names has no code left', 'the flag cannot be set by anyone any more'] }
    ],
    options: [{ title: 'A · keep R5 red — a product ask to bring severance back', fails: 'a permanent red no run can change' }, { title: 'B · rewrite R5 as the per-part takeover, in entity R2/R4\'s words', fails: 'entity R3\'s basis-set ↺ question arrives with it' }],
    recommend: 'B — the substitution you accepted here on 08-13 and on entity on 09-03'
  },
  // ---------------------------------------------------------------- D3b
  {
    id: 'D3b', question: 'The cost page: how does a governed line say who authors its method? (R11)', badge: 'R11',
    words: { given: 'the operation-cost page prices Property Management Fee as % of Revenue', when: 'the blanket grid <b>takes the fee\'s method over</b>', thens: ['the Assumption column marks it', 'clicking it'] },
    moments: ['Given · the cost page row', 'When · the blanket takes the method over', 'Then · the Assumption column', 'Then · clicking it'],
    sources: [
      { id: 'spec', kind: 'spec', label: 'SPEC says', short: 'SPEC', sub: 'R11 (added 08-04): a read-only chip that deep-links to the blanket grid',
        scenes: [
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue'), c('$31,404.00')]),
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue'), c('$31,404.00')], { when: { type: 'pulse', target: [0, 2] } }),
          grid(CR, WR, [c('8'), c('Property Management Fee'), { html: '<span class="chipm">Overridden · Blanket ↗</span>', ring: true }, c('$31,404.00')]),
          grid(CR, WR, [c('8'), c('Property Management Fee'), { html: '<span class="chipm">Overridden · Blanket ↗</span>' }, c('$31,404.00')], { flag: 'opens <span class="k">/assumption/operation-growth/operating-expenses</span> with the designed tooltip', flagRing: true })
        ],
        notes: ['', '', 'a chip in place of the editable method', 'straight to the grid that authors it'] },
      { id: 'doc', kind: 'doc', label: 'DOC = CODE', short: 'DOC = CODE', sub: 'SD-07 §3.4.2: chip and deep link REMOVED 08-08',
        scenes: [
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue'), c('$31,404.00')]),
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue'), c('$31,404.00')], { when: { type: 'pulse', target: [0, 2] } }),
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue', '', true), c('$31,404.00')]),
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue'), c('$31,404.00')], { flag: 'nothing to click — plain read-only text', flagRing: true })
        ],
        notes: ['', '', 'the resolved selection as plain read-only text', 'no link; the owner removed it'] },
      { id: 'act', kind: 'act', label: 'ACTUAL', short: 'ACTUAL', sub: 'photographed today',
        scenes: [
          img([{ src: IMG.c_pmfee_rows }]),
          img([{ src: IMG.c_pmfee_rows }]),
          img([{ src: IMG.c_pmfee_rows, boxes: [{ l: 36, t: 2, w: 18, h: 48 }] }]),
          img([{ src: IMG.c_pmfee_rows, boxes: [{ l: 36, t: 2, w: 18, h: 48 }] }])
        ],
        notes: ['row 8: % of Revenue · $31,404.00', '', 'plain text, exactly as the doc says', 'not a link'] }
    ],
    options: [{ title: 'A · keep R11 red', fails: 'asks for a thing the owner removed' }, { title: 'B · delete R11 (one line under ③ if the plain text deserves a rule)', fails: '—' }],
    recommend: 'B'
  },
  // ---------------------------------------------------------------- D3c
  {
    id: 'D3c', question: 'A property that sets its own percentage on a ratio line — what marks it? (R12·4)', badge: 'R12·4',
    words: { given: 'Property Management Fee inherits House View\'s 3% of Revenue', when: 'the property <b>sets its own 6%</b>', thens: ['the Method cell\'s marker', 'the rate'] },
    moments: ['Given · inherits 3%', 'When · the property sets 6%', 'Then · the marker', 'Then · the rate'],
    sources: [
      { id: 'spec', kind: 'spec', label: 'SPEC says', short: 'SPEC', sub: 'R12 bullet 4: "marked Standalone" · golden.json standalonePill',
        scenes: [
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')]),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('6.00%', 'typed'), c('3.00%', 'inh')], { when: { type: 'type', cell: [0, 2], from: '3.00%', text: '6.00%' } }),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue <span class="pill2">Standalone</span>', true), c('6.00%', 'ovl'), c('6.00%', 'ovl')]),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue <span class="pill2">Standalone</span>'), c('6.00%', 'ovl', true), c('6.00%', 'ovl', true)])
        ],
        notes: ['', '', 'the "Standalone" pill', 'the property\'s own 6%'] },
      { id: 'doc', kind: 'doc', label: 'DOC = CODE', short: 'DOC = CODE', sub: 'pill retired 08-06 ("redundant and useless") · standaloneMethodPill: no code left',
        scenes: [
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')]),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue'), c('6.00%', 'typed'), c('3.00%', 'inh')], { when: { type: 'type', cell: [0, 2], from: '3.00%', text: '6.00%' } }),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue ↺', true), c('6.00%', 'ovl'), c('6.00%', 'ovl')], { flag: '<span class="badge2">Overlays 1</span>' }),
          grid(C4, W4, [c(PMF), sel('Ratio — % of Revenue ↺'), c('6.00%', 'ovl', true), c('6.00%', 'ovl', true)], { flag: '<span class="badge2">Overlays 1</span>' })
        ],
        notes: ['', '', 'the ↺ arrow on the cell and the Overlays count', 'the property\'s own 6%, blue'] },
      { id: 'act', kind: 'act', label: 'ACTUAL', short: 'ACTUAL', sub: 'photographed today · not performed on the fixture',
        scenes: [
          img([{ src: IMG.g_method, w: '70%' }]),
          empty('not performed today'),
          empty('nothing to photograph: the pill cannot render on any row'),
          empty('not performed today')
        ],
        notes: ['Ratio — % of Revenue, following House View', '', 'the marker the spec names no longer exists', ''] }
    ],
    options: [{ title: 'A · keep R12·4 red', fails: 'red by retirement, not regression' }, { title: 'B · reword to "marked by the ↺ and the Overlays count"', fails: '—' }],
    recommend: 'B'
  },
  // ---------------------------------------------------------------- D4
  {
    id: 'D4', question: 'Property Management Fee inherits 3% of Revenue from House View. What does the blanket grid show, and what does the cost page charge?', badge: 'R12·1 · R9', badgeKind: 'mis',
    words: { given: 'House View holds a 3% of Revenue leg for Property Management Fee; the property has not taken it over', when: 'the property\'s blanket grid <b>renders the fee</b>', thens: ['the Long Term and year cells read the inherited percentage', 'the cost page charges it'] },
    moments: ['Given · House View holds 3%', 'When · the blanket renders the fee', 'Then · the Long Term and year cells', 'Then · the cost page'],
    sources: [
      { id: 'spec', kind: 'spec', label: 'SPEC = DOC', short: 'SPEC = DOC', sub: 'R12 "shows House View\'s percentage" · SD-07 §1.A inherit = first non-null',
        scenes: [
          grid(['House View', 'Method / Selection', 'Long Term', '2026'], W4, [c('PM Fee'), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')]),
          grid(C6, W6, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh'), c('3.00%', 'inh'), c('3.00%', 'inh')], { when: { type: 'pulse', target: [0, 1] } }),
          grid(C6, W6, [c(PMF), sel('Ratio — % of Revenue'), c('3.00%', 'inh', true), c('3.00%', 'inh', true), c('3.00%', 'inh', true), c('3.00%', 'inh', true)]),
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue · 3.00%'), c('$31,404.00', '', true, { ok: true })])
        ],
        notes: ['the House View operation-growth grid', 'the blanket row appears', 'the inherited 3% reads in every cell, green', '3% × revenue = $31,404'] },
      { id: 'code', kind: 'code', label: 'CODE does', short: 'CODE', sub: 'row.adopted served as 0 (hv_owned_scalars.py:151) · grid reads the ROW (lib/utils.ts:528) · engine reads the LEG (operating.py:702)',
        scenes: [
          grid(['House View', 'Method / Selection', 'Long Term', '2026'], W4, [c('PM Fee'), sel('Ratio — % of Revenue'), c('3.00%', 'inh'), c('3.00%', 'inh')], { flag: 'fee-level <span class="k">adopted: NULL</span> · leg <span class="k">rate: 0.03</span>' }),
          grid(C6, W6, [c(PMF), sel('Ratio — % of Revenue'), c('0.00%', 'inh'), c('0.00%', 'inh'), c('0.00%', 'inh'), c('0.00%', 'inh')], { when: { type: 'pulse', target: [0, 1] }, flag: 'API row: <span class="k">adopted: 0</span> · leg <span class="k">assumption_rate: 0.03 · sources: house_view</span>' }),
          grid(C6, W6, [c(PMF), sel('Ratio — % of Revenue'), c('0.00%', 'inh', true), c('0.00%', 'inh', true), c('0.00%', 'inh', true), c('0.00%', 'inh', true)], { flag: 'the grid paints the ROW\'s <span class="k">adopted</span> → 0.00%', flagRing: true }),
          grid(CR, WR, [c('8'), c('Property Management Fee'), c('% of Revenue · 3.00%'), c('$31,404.00', '', true, { ok: true })], { flag: 'the engine prices the LEG\'s rate → 3% × revenue' })
        ],
        notes: ['House View\'s fee-level scalar is NULL; the percentage lives on the leg', 'the read serves NULL as 0 on the row and 0.03 on the leg', 'two ladders: the year cells and the Long Term cell both end on the row scalar here', 'the engine never looks at the row scalar'] },
      { id: 'act', kind: 'act', label: 'ACTUAL', short: 'ACTUAL', sub: 'photographed today, both pages',
        scenes: [
          empty('House View page not photographed today'),
          img([{ src: IMG.g_pmfee_row }]),
          img([{ src: IMG.g_pmfee_row, boxes: [LTA_BOX, YRS_BOX] }]),
          img([{ src: IMG.c_pmfee_rows, boxes: [{ l: 36, t: 50, w: 36, h: 50, ok: true }] }])
        ],
        notes: ['', 'the blanket row', '0.00% in Long Term and every year — the one clean display bug', 'the cost page: Ratio 3.00% → $31,404.00'] }
    ],
    options: [{ title: 'A · fix the read: serve the sole active leg\'s rate as the row\'s', fails: 'the Long Term cell still reads raw adopted — the grid\'s second ladder must go too' }, { title: 'B · fix the grid: collapse to the governed price entity already computes', fails: 'every other consumer keeps hearing 0' }],
    recommend: 'A and one ladder in the grid — the Expected-html row; write it red-first before touching either side'
  },
  // ---------------------------------------------------------------- D5
  {
    id: 'D5', question: 'You type 4.00% into a year cell whose House View value is already 4.00%, then click away and save. What happens?', badge: 'doc ↔ doc · R4',
    words: { given: 'Repair &amp; Maintenance 2028 inherits 4.00%', when: 'you <b>type 4.00%</b> into 2028 and click away', thens: ['the cell', 'on Save'] },
    moments: ['Given · 2028 inherits 4.00%', 'When · you type the same 4.00%', 'Then · the cell', 'Then · on Save'],
    sources: [
      { id: 'jul', kind: 'spec', label: 'DOC · July', short: 'DOC JUL', sub: 'SD-07 §4.3 (07-08 / 07-18)',
        scenes: [
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'inh')]),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'typed')], { when: { type: 'type', cell: [0, 3], from: '', text: '4.00%' } }),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'red', true)]),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'red')], { dialog: 'Clear redundant overrides? <span>Keep</span><span>Clear</span>', dialogRing: true })
        ],
        notes: ['', '', 'a grey "redundant" pin (the no-change guard makes a click-away inert)', 'a dialog offers to clear it'] },
      { id: 'aug', kind: 'doc', label: 'DOC · August', short: 'DOC AUG', sub: 'SD-07 §3.4.7(2)+(4) (08-22)',
        scenes: [
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'inh')]),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'typed')], { when: { type: 'type', cell: [0, 3], from: '', text: '4.00%' } }),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00% ↺', 'ovl', true)], { flag: '<span class="badge2">Overlays 1</span>' }),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00% ↺', 'ovl')], { flag: '<span class="badge2">Overlays 1</span> no dialog, no grey, no guard', flagRing: true })
        ],
        notes: ['', '', 'a blue overlay with a ↺ — "a pin is created only by an explicit commit"', 'saved as a pin; equal-to-House-View is still a fact'] },
      { id: 'code', kind: 'code', label: 'CODE does', short: 'CODE', sub: 'cell guard ε 1e-13 (yearValueUtils.ts:41) · save diff ε 1e-8 (utils.ts:1191)',
        scenes: [
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'inh')]),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.0000000001%', 'typed')], { when: { type: 'type', cell: [0, 3], from: '', text: '4.0000000001%' } }),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.0000000001%', 'ovl', true)], { flag: 'cell: changed (ε 1e-13) → blue, row dirty' }),
          grid(CY, WY, [c(RM), c('4.00%', 'lock'), c('4.00%', 'inh'), c('4.00%', 'inh', true)], { flag: 'save diff: unchanged (ε 1e-8) → payload <span class="k">{}</span>', flagRing: true })
        ],
        notes: ['', 'a legal ten-decimal edit', 'the cell says changed', 'the save says unchanged — the edit vanishes'] },
      { id: 'act', kind: 'none', label: 'ACTUAL', short: 'ACTUAL', sub: 'not photographed',
        scenes: [empty('no test types an equal value or a ten-decimal one yet'), empty('not performed'), empty('not performed'), empty('not performed')],
        notes: ['the mistake-path slot is empty', '', '', 'a red-first test fills it after the decision'] }
    ],
    options: [{ title: 'A · the July ruling', fails: 'the later section says it was retired' }, { title: 'B · the August ruling, R4 amended to say what a typed-equal value is', fails: 'the two epsilons must become one' }],
    recommend: 'B — the later ruling; the epsilon is then an engineering fix with a test'
  }
]
