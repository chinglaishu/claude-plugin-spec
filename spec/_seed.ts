// spec/_seed.ts — your project's E2E "golden data" seed. OPTIONAL, and a no-op until you fill it in.
//
// WHY THIS EXISTS. A data-driven screen's test should assert EXACT values (this tile reads 12,340;
// selecting the second filter lists exactly these three items). That is only reproducible when the
// data is fixed — a test that asserts whatever is live drifts red the moment anyone edits the data.
// So you seed a dedicated, deterministic "golden" fixture once, before the suite, and assert it
// thereafter; then a change in the app's COMPUTATION fails the test, which is the whole point.
//
// HOW IT RUNS. If this file is present, the vendored Playwright globalSetup imports it and calls the
// default export once, before any test. (A `seed:e2e` npm script, if you define one, takes
// precedence — use that when your seed lives in another toolchain, e.g. a backend seeder or a script
// in another language.) Leaving this stub exactly as shipped is completely inert: no golden data, no
// effect on your suite.
//
// THE CONTRACT — keep all three, or golden tests become flaky lies:
//   1. Idempotent. Safe to run on every suite; seeding twice equals seeding once. Upsert by a stable
//      id/name; never depend on "the first row" or an auto-increment you cannot predict.
//   2. Isolated. Touch ONLY your golden fixture (a dedicated entity with a known id). Never mutate a
//      real user's canonical data to make a test pass.
//   3. Draft-scoped for mutating flows. If a test edits -> runs -> applies, do it on a throwaway
//      draft/scenario and reset by re-seeding (or discarding the draft) — never on canonical data.
//
// Prefer your project's OWN migration/seeder (its factories, its fixtures) over raw SQL: it already
// knows the invariants your data must hold. Then record the resulting expected numbers in
// spec/<screen>/golden.json and assert them from the test (see the kg-e2e skill's golden-data section).

export default async function seed (): Promise<void> {
  // No golden data yet. Replace this body with an idempotent seed of your golden fixture, e.g.:
  //
  //   const { db } = await import('../<your data layer>')          // your own project's tooling
  //   await db.upsertEntity({ id: 'e2e-golden', name: 'E2E Golden', ...fixedInputs })  // stable id
  //
  // ...then capture spec/<screen>/golden.json by driving the seeded screen once, and assert it.
}
