// The home card's DERIVED facts (Task 8, the frozen mockup 2026-08-17 — board R1/R4/R6): the
// project crumb, a screen's unit · flow kind counts, and its latest-run still. All three are pure
// derivations off the tree (package.json + spec/_config.json, the source plans ∪ the folded index,
// screen.png ∪ the evidence harvest) — nothing stored, so each is unit-tested here without a board.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectIdentity, screenKinds, latestStill } from './build-board.mjs'
import { cleanConfig } from './spec-store.mjs'

// ── H6: the header crumb — "<project> · <tagline>" ───────────────────────────
test('the crumb derives from package.json name + the config tagline', () => {
  const id = projectIdentity({ name: 'tsumiki-demo' }, { tagline: 'task-tracker demo' }, 'todo')
  assert.equal(id.crumb, 'tsumiki-demo · task-tracker demo')
})
test('no tagline → the name alone; no package name → the repo directory name', () => {
  assert.equal(projectIdentity({ name: 'acme' }, {}, 'x').crumb, 'acme')
  assert.equal(projectIdentity({}, {}, 'my-repo').crumb, 'my-repo')
  assert.equal(projectIdentity(null, null, 'my-repo').crumb, 'my-repo')
})
test('"dogfooding itself" appears ONLY on specboard\'s own repo', () => {
  assert.equal(projectIdentity({ name: 'specboard' }, {}, 'claude-plugin-spec').crumb, 'specboard · dogfooding itself')
  assert.doesNotMatch(projectIdentity({ name: 'tsumiki-demo' }, {}, 'todo').crumb, /dogfooding/)
  // an authored tagline on the plugin's own repo still wins over the default
  assert.equal(projectIdentity({ name: 'specboard' }, { tagline: 'x' }, 'r').crumb, 'specboard · x')
})
test('the config keeps a tagline through a save (cleanConfig must not strip it)', () => {
  assert.equal(cleanConfig({ tagline: 'task-tracker demo' }, {}).tagline, 'task-tracker demo')
  assert.equal(cleanConfig({ baseUrl: 'http://x' }, { tagline: 'kept' }).tagline, 'kept', 'a partial save preserves it')
  assert.equal(cleanConfig({}, {}).tagline, '')
})

// ── H2: unit · flow counts — the UNION of the source plan's kind and the record's kind ──────────
test('screenKinds counts unit and flow tests — flowStep in the source OR a cross-screen tag in the record', () => {
  const s = {
    name: 'board',
    plans: [
      { title: 'a unit', steps: [{ kind: 'prove', id: 'R1' }] },
      { title: 'a flowStep flow', steps: [{ kind: 'flow', text: 'open' }, { kind: 'prove', id: 'R2' }] },
      { title: 'a tag-crossing flow', steps: [{ kind: 'prove', id: 'dispatch:R7' }] }
    ],
    run: { tests: [
      { title: 'a unit', ok: true, reqs: { 'board:R1': 'pass' } },
      { title: 'a flowStep flow', ok: true, reqs: { 'board:R2': 'pass' } },        // the record says unit — the source wins
      { title: 'a tag-crossing flow', ok: true, reqs: { 'dispatch:R7': 'pass' } }  // the record says flow — the record wins
    ] }
  }
  assert.deepEqual(screenKinds(s), { unit: 1, flow: 2 })
})
test('screenKinds with no plans falls back to the run records; nothing at all is 0 · 0', () => {
  assert.deepEqual(screenKinds({ name: 'x', plans: [], run: { tests: [{ title: 't', reqs: { 'x:R1': 'pass' } }] } }), { unit: 1, flow: 0 })
  assert.deepEqual(screenKinds({ name: 'x', plans: [], run: undefined }), { unit: 0, flow: 0 })
})

// ── H4: the latest-run still — screen.png, else the newest harvested after-frame ─────────────────
test('latestStill prefers screen.png and captions it with the run', () => {
  const s = { name: 'board', hasShot: true, shotHash: 'abc', run: { ranAt: 5, evidence: {} } }
  const st = latestStill(s, [{ runId: '5', screen: 'all', shotsByTest: { t: { commit: 'd2a8c5e' } } }])
  assert.equal(st.src, 'spec/board/screen.png')
  assert.equal(st.hash, 'abc')                                     // the content cache-buster rides along
  assert.equal(st.run, 'd2a8c5e')                                  // the newest run's commit, when recorded
})
test('latestStill falls back to the newest after-frame of the evidence harvest (the Tsumiki case)', () => {
  const s = { name: 'todo', hasShot: false, run: { ranAt: 7, evidence: {
    R1: { after: 'spec/todo/evidence/R1.after.png', at: '2026-08-22T15:34:05.741Z', runId: '7' },
    R5: { after: 'spec/todo/evidence/R5.after.png', at: '2026-08-22T15:34:09.000Z', runId: '7' }
  } } }
  const st = latestStill(s, [])
  assert.match(st.src, /^spec\/todo\/evidence\/R5\.after\.png/)   // the newest by `at`
  assert.equal(st.run, '7')                                        // no commit on record → the run id
})
test('latestStill is null with neither a shot nor evidence — the honest empty cover', () => {
  assert.equal(latestStill({ name: 'x', hasShot: false, run: undefined }, []), null)
})
