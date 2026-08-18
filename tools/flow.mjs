// Flow derivation — the pure foundation the Flow player stands on. A recorded test's flattened
// steps (spec/_results-reporter.mjs flattenSteps: { label, cat, depth, ok, t, d }) already carry
// everything the player needs; these functions DERIVE a test's kind (unit or flow) and its ordered
// chapters from that record, storing nothing new. Pure and Playwright-free (node --test,
// tools/flow.test.mjs) — no clock, no fs, no randomness.
//
// Two facts of the real data shape this file (verified against a green run's records):
//   - a flow can cross screens by TAG alone — the dispatch-R7 flow proves `dispatch:R7` while
//     standing on /#/board and never navigates to a dispatch route — so kind comes from the
//     qualified ids, never from navigation;
//   - the flat steps array is TREE order, not time order (a sibling can carry an earlier `t` than
//     the nested steps before it), so a chapter's seek point is its EARLIEST step, not its first.

// Mirrors tools/coverage.mjs — the one grammar for a proof marker.
const PROVES = /^proves\s+(\S+)/

// A bare id (`R4`) means "this test's own screen"; a qualified id (`dispatch:R7`) names another.
const splitId = (id, screen) => {
  const s = String(id)
  const i = s.indexOf(':')
  return i > 0 ? { screen: s.slice(0, i), bare: s.slice(i + 1) } : { screen, bare: s }
}

// A test is a FLOW when it proves any requirement beyond its own screen — the same rule the
// board's coverage fold uses, applied to the qualified id set (index `reqs` keys server-side,
// `proves <id>` labels client-side). No ids reads as a unit, never a crash.
export function deriveKind (qualifiedIds, screen) {
  for (const id of qualifiedIds || []) {
    if (splitId(id, screen).screen !== screen) return 'flow'
  }
  return 'unit'
}

// The screen a humanized navigation step lands on, from its hash route: `Open /#/board` → board,
// `Open /#conflicts` → conflicts, `Open /#howitworks/kg-deep` → howitworks. A hash-less URL
// (`Open /`) names no screen — the home page is nobody's chapter. The caller must have checked
// cat === 'pw:api' first: an AUTHORED sentence may also start with "Open " (a real flowStep in
// this repo reads "Open the board detail — …") and must never register as a navigation.
function routeScreen (label) {
  const m = /^Open (\S+)/.exec(String(label || ''))
  if (!m) return null
  const h = m[1].indexOf('#')
  if (h < 0) return null
  const seg = m[1].slice(h + 1).replace(/^\/+/, '').split(/[/?]/)[0]
  return seg || null
}

// The REACHED chapters of one recorded test, ordered by seek offset. Each chapter is a run of
// steps on one screen: { title, screen, t, reqs, ok } — the stage name (the authored sentence
// that opens it, else the screen name), the screen it plays on, the ms offset of its earliest
// step (the seek point into the ONE recording), the BARE requirement ids it proves (deduped, in
// order), and false if any step in it failed. Boundaries:
//   - an authored top-level test.step sentence starts a chapter (its stage name);
//   - a navigation landing on another screen, or a `proves` tag qualified to another screen,
//     starts a chapter there — unless the current chapter has no body yet (a stage sentence whose
//     group opens with the goto, or a test whose first act is the crossing), which RE-HOMES the
//     open chapter instead of splitting a one-step sliver off it.
// A test that never leaves its screen chapters purely by its authored sentences — the setup
// before the first sentence folds into the first chapter so chapter one seeks to the start — and
// with no sentences at all it is a single chapter spanning the whole test.
// Not-reached chapters are NOT synthesized here: the steps only contain what ran; the player
// composes not-reached from the declared coverReqs set against these reached chapters.
export function deriveChapters (steps, screen) {
  const list = Array.isArray(steps) ? steps.filter(s => s && typeof s === 'object') : []
  if (!list.length) return []

  const provesId = s => {
    if (s.cat !== 'test.step') return null
    const m = PROVES.exec(String(s.label || ''))
    return m ? m[1] : null
  }
  const navTo = s => (s.cat === 'pw:api' ? routeScreen(s.label) : null)

  // Authored stage sentences: test.step at the shallowest such depth, `proves` markers excluded —
  // a proof tag is coverage grammar, not a stage a person named.
  let minDepth = Infinity
  for (const s of list) {
    if (s.cat === 'test.step' && !provesId(s)) minDepth = Math.min(minDepth, s.depth | 0)
  }
  const isSentence = s => s.cat === 'test.step' && (s.depth | 0) === minDepth && !provesId(s)

  // Does this run ever leave its own screen? Decided up front (not mid-walk) because it changes
  // what the first sentence means: on a single-screen test the sentence absorbs the setup before
  // it; on a crossing test that setup is its own chapter — the sentence may be about to leave.
  let single = true
  for (const s of list) {
    const pid = provesId(s)
    if (pid && splitId(pid, screen).screen !== screen) { single = false; break }
    const r = navTo(s)
    if (r && r !== screen) { single = false; break }
  }

  const chapters = []
  let cur = null
  const open = (title, scr) => { cur = { title, screen: scr, t: null, reqs: [], ok: true, n: 0, body: 0 } }
  const push = () => { if (cur.n) chapters.push(cur) }
  const assign = (s, sentence) => {
    cur.n++
    if (!sentence) cur.body++
    if (typeof s.t === 'number' && (cur.t == null || s.t < cur.t)) cur.t = s.t
    if (s.ok === false) cur.ok = false
    const pid = provesId(s)
    if (pid) {
      const bare = splitId(pid, screen).bare
      if (!cur.reqs.includes(bare)) cur.reqs.push(bare)
    }
  }

  open(null, screen)
  for (const s of list) {
    if (isSentence(s)) {
      const fold = single ? (chapters.length === 0 && cur.title == null) : cur.n === 0
      if (fold) cur.title = String(s.label || '')
      else { push(); open(String(s.label || ''), cur.screen) }
      assign(s, true)
      continue
    }
    if (!single) {
      const pid = provesId(s)
      const to = navTo(s) || (pid ? splitId(pid, screen).screen : null)
      if (to && to !== cur.screen) {
        if (cur.body === 0) cur.screen = to
        else { push(); open(null, to) }
      }
    }
    assign(s, false)
  }
  push()

  return chapters
    .map(c => ({
      title: c.title == null ? c.screen : c.title,
      screen: c.screen,
      t: c.t == null ? 0 : c.t,
      reqs: c.reqs,
      ok: c.ok
    }))
    .sort((a, b) => a.t - b.t)
}
