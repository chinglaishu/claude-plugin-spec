---
name: kg-e2e
description: Use to author the E2E test for a specboard screen — the column-4 spec that proves the PRD and, as a byproduct, shoots column 3's screen.png. Write the failing assertion first and watch it go red. Used standalone when a screen needs its test, and by brownfield kg-init to characterize an existing screen.
---

# Authoring the test that proves a screen

Column 4 is what turns "we think it works" into "a machine checked." The test lives next to the
screen it proves — `spec/<screen>/test.spec.ts` — and it does two jobs at once: it **asserts the
requirements** in that screen's `prd.md`, and it **shoots `spec/<screen>/screen.png`**, which is
column 3. Column 3 is therefore always a *byproduct* of a passing test, never a picture captured by
hand. That is the invariant the whole board rests on; do not break it by writing a screenshot any
other way.

## The rules that make it a test and not a decoration

1. **Write the failing assertion first, and watch it go red.** A test written after the code can only
   confirm what the code already does. Run it, see it fail for the reason you expect, then make it
   pass. If you cannot make it fail, you have not yet written a test.
2. **Assert something that can fail.** If the test would still pass with the requirement deleted from
   the app, it is a smoke alarm with the battery out. Assert the *behaviour the requirement names* —
   the text that must appear, the control that must work, the state that must change — not that "the
   page loaded."
3. **Assert on DATA, not chrome.** A real app's frame — nav, headings, an empty table — paints
   instantly, so a test that checks a heading passes *before the list has loaded*. Push the assertion
   onto content that only exists once the API resolved: a real table row, a grid cell, an API-derived
   number. Wait for it first with `waitForContent(locator)` from `_base`, then assert. This is the
   single most common way a guessed characterization test becomes a false green — the screen "passes"
   without its data ever arriving, and the screenshot catches an empty shell.
4. **Assert that something DID happen — and beware occlusion.** `toBeVisible()` checks only that an
   element is not `display:none`; it does NOT check whether a modal or overlay covers it. So a test
   built from presence/absence checks can pass while the page is stuck behind a popup — asserting DOM
   the user cannot reach, with the screenshot capturing the popup, not the screen. Dismiss transient
   notices first (click their "Got it"/close, then assert they are gone), and prefer proving a real
   OUTCOME — a lever moves a number, a search narrows a list, a save shows up elsewhere — an effect a
   frozen page cannot fake. Ask of every assertion: "would this still pass if the page were frozen
   behind an overlay?" If yes, it is not proving anything happened.

Never weaken, skip, or delete an assertion to go green (CLAUDE.md rule 3). When a test breaks after a
change, first find which of the two — the test or the code — is wrong, before editing either.

## The shape

```ts
import { test, expect } from '../_base'

// One test per requirement it proves. Name it by the requirement, so a red result points at the
// behaviour that broke, not at a file.
test('R1 — <the behaviour R1 names>', async ({ page }) => {
  await page.goto('/<route>')            // see "which URL" below
  // assert the behaviour R1 describes — something that fails if the app stops doing it
  await expect(page.getByRole('heading', { name: /.../ })).toBeVisible()
})

test('R2 — <the behaviour R2 names>', async ({ page }) => {
  await page.goto('/<route>')
  // ...
  // The LAST test to run for a screen shoots column 3. One screenshot per screen is enough.
  await page.screenshot({ path: 'spec/<screen>/screen.png', fullPage: false })
})
```

- Import `{ test, expect }` from `'../_base'` — never from `@playwright/test` directly; `_base`
  carries the one-window behaviour a watched run needs.
- `spec/<screen>/screen.png` is written by exactly one test (usually the last), with
  `page.screenshot({ path: ..., fullPage: false })`. Do not capture it separately, and do not copy
  another image into it.

## Which URL a test navigates to

- **A design-mode screen** (you built a wireframe and then the real thing): the test drives whatever
  you built. For specboard's own screens that is the board on `/`; for a project's own new screen it
  is that screen's route on the app.
- **A document-mode / characterization screen** (an existing screen kg-init crawled): navigate the
  **real running app** at its route, taken from `spec/_config.json` (`baseUrl` + the screen's
  `route`). The screenshot is then the app as it actually is, and the assertions lock in its current
  behaviour as the baseline. The guessed PRD gives that baseline meaning: when the CEO corrects the
  PRD to say the behaviour *should* differ, you update the test to the corrected PRD — and its
  failing against the current app is then a real bug surfaced, which is the point.

## Authenticating (document mode against a real app)

A real app is usually behind a login, and a document-mode test must reach screens that require it. You
do **not** log in inside each test. Instead, put a `signIn` script in `spec/_config.json` (Setup →
sign-in), and the harness runs it **once** in a `setup` project that saves the session; every screen
test then runs in the `screens` project already authenticated (`dependencies:['setup']`, reusing the
saved `storageState`). So the test just navigates to its route and asserts — it starts logged in.

Two things that will cost you an afternoon otherwise:

- **The signIn script must TYPE, never `page.fill()`.** Controlled React inputs (react-hook-form and
  most component libraries) ignore `fill()`'s programmatic value and submit an **empty** form with no
  error — you sit on `/login` wondering why. Use `pressSequentially`, or click the field then `type`.
- **The login screen itself is bespoke.** Once signed in, `/login` redirects away, so the crawl can
  never reach it and it can't be a document-mode screen. Write its PRD and test by hand.

## Comprehensive, not shallow — depth over count

A screen's test proves the screen works, not that it painted. One "the heading is visible" case per
requirement is the shallow trap that makes a board look finished while proving almost nothing. Write a
FEW deep cases instead:

- **The surface renders REAL data** — every metric/tile carries a value (a digit, money, a %), the
  grid/list is populated with rows, the chart is present, the controls exist. Wait for the data (see
  traps) before asserting.
- **A core interaction changes an outcome** — drive the primary lever/toggle and assert its *effect*,
  not merely that the control exists.
- **A cross-page effect**, where the screen has one — a change here shows up there.

Two or three cases that exercise the screen's real behaviour beat ten that each check a label.

## Deterministic golden data — assert EXACT values, not live ones

A data-driven screen invites the worst false green of all: a test that reads *whatever data is live*.
"The first row's total is 12,340" passes today and goes red the moment anyone edits that row — the
number drifted, nothing broke — and "there are some rows" (rule 2) proves almost nothing. The fix is
to make the data itself deterministic, so the test can name the exact values it expects:

- **Seed a dedicated golden fixture — never target "the first entity."** Add a known entity with
  FIXED inputs (a stable id/name, e.g. `e2e-golden`) through the *project's own* migration/seeder — its
  factories know the invariants raw SQL would miss. Target that entity **by its stable id**, so the
  test is pinned to data it controls, not to whatever happens to sort first.
- **Record the expected values in `spec/<screen>/golden.json`, and assert them.** A per-screen file of
  expected observable values, keyed **per state** — per selected filter/period/tab: which items/rows
  are shown, and the exact number each tile/cell holds. Generate it *once* by driving the seeded app
  and reading the values off; commit it; assert it thereafter. Now a change in the app's computation
  fails the test with a concrete diff (`expected 12,340, got 12,900`) — exactly the signal you want.
- **Idempotent seed, draft-scoped mutation.** The seed must be safe to run on every suite (upsert by
  the stable id; seeding twice == once) and touch ONLY the golden fixture. For a mutating flow (edit →
  run → apply), act on a **throwaway draft/scenario** and reset by re-seeding or discarding the draft —
  never mutate the canonical golden inputs to go green (rule 3; it also makes the next run's "before"
  value a lie).

### Where the seed runs

Put the seed where the vendored harness runs it once, before any test:

- **`spec/_seed.ts`** — an idempotent default-export function; `globalSetup` imports and calls it
  before the suite (Playwright's own loader runs the TypeScript). The scaffold ships it as an inert
  no-op stub, so a project with no golden data is unaffected.
- **or a `seed:e2e` npm script**, which *takes precedence* over `_seed.ts` — use it when your seed
  lives in another toolchain (a backend seeder, another language). The harness runs `npm run seed:e2e`
  before the suite and **fails setup** if it errors (a suite asserting golden values against an
  unseeded app is worse than an honest red at the gate).

A rough `golden.json` shape — states as keys, each naming the items shown and the numbers to assert;
for a mutating flow, record BOTH sides of the change you drive:

```jsonc
{
  "filterA": { "items": ["Alpha", "Bravo", "Charlie"], "total": 12340 },
  "filterB": { "items": ["Alpha", "Delta"],            "total":  8060 },
  "afterEdit": { "changed": "Bravo", "total_before": 12340, "total_after": 13100 }
}
```

The test reads `golden.json`, drives the seeded screen, and asserts each state's exact items and
numbers — including the *before → after* of the interaction — so the run PROVES the computation, not
merely that the grid has rows.

## Traps against a real running app

Each of these has produced a false green or lost an afternoon — handle them by default:

- **Wait for DATA, not the shell — generously.** The frame paints instantly; the numbers arrive after
  an API call, and a heavy app can take 20–30s on a cold run. Gate each screen on a real value (a
  metric containing a digit or money) and a populated list BEFORE asserting anything else.
- **Controlled inputs must be TYPED, and VERIFIED.** `fill()` races react-hook-form/controlled state
  and drops the leading keystrokes — a wrong value, silently. Use `pressSequentially`, then read the
  value back and retype if it came up short. (The same trap as sign-in; it also bites search boxes.)
- **Virtualized grids:** rows often carry `role=row` with NO `role=grid` ancestor, so
  `getByRole('row')` finds none — target the attribute, `locator('[data-testid=grid] [role=row]')`.
  And do NOT assert the row-node count falls on a filter: virtualization keeps nodes, so that is a
  flaky claim.
- **Accessible names can include hidden helper text.** A control showing a short visible label may
  have an accessible name that also contains a tooltip or description, so `{name:'<label>',
  exact:true}` finds nothing — match the distinctive visible text instead.
- **Read-only surfaces intercept clicks.** A locked/read-only form group swallows a scripted click;
  assert presence there, and prove the interaction on the editable surface.
- **Prefer `data-testid`.** Real apps are usually instrumented with testids; they are the most stable
  selectors — harvest the app's own testids while exploring and use them over text/role.

## Stateful and cross-page flows (edit → run → apply → verify elsewhere)

The most valuable tests span pages — edit here, apply, verify the effect there. But "apply" usually
PERSISTS: a test that applies on every run mutates real data non-idempotently. The only safe
repeatable shape is **create a throwaway draft/scenario → act → verify → discard** (or a reset). If no
discard path exists, do NOT write a test that corrupts data on every run — document the gap in the PRD
and cover what you safely can. A test that mutates production state to go green is worse than an
honest empty cell.

## Run it and read the result

```bash
npm run e2e                         # the whole suite
npx playwright test --config playwright.board.ts spec/<screen>/test.spec.ts   # just this screen
```

A per-screen run folds its result into `spec/_results-index.json` without blanking any other screen's
column — so running one screen to prove it is safe. Watch the new test fail first; then make it pass;
then confirm the board's column 4 shows it green and column 3 shows the shot it produced.
