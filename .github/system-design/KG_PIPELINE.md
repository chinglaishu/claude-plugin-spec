---
slug: kg-pipeline
title: Build and sync — the entrypoints that write the graph
lens: workflow
domain: dev-tooling
status: draft
governs:
  - src/build.ts
  - src/sync.ts
requirements:
  - id: REQ-KG-PIPE-01
    text: Every entrypoint that writes the graph resolves the project it measures
      from the working directory, with KG_REPO_ROOT overriding it, and loads
      that project's config once rather than deriving any path from the tool's
      own location.
  - id: REQ-KG-PIPE-02
    text: sync reports the issue ratchet without ever blocking on it, naming each
      kind whose count moved and warning when any rose above baseline, so the
      inner loop stays usable while check remains the only gate that fails.
  - id: REQ-KG-PIPE-03
    text: sync warns when no test results have been recorded, and when the recorded
      results are older than a staleness threshold, because a graph whose test
      statuses came from a stale run reports proof it no longer has.
  - id: REQ-KG-PIPE-04
    text: sync reports what changed against the previously committed graph, and
      suppresses that report under --quiet.
---

## Drafted from code, not yet approved

Read from `src/build.ts` and `src/sync.ts` on 2026-07-24 by `kg-draft-spec`. Each requirement above
records what the implementation currently does. **Nothing here has been decided by a human**, and a
requirement read off an implementation cannot contradict it — if the code is wrong, the text above is
wrong in exactly the same way.

## Open questions for the CEO

These are the reason this document exists. Every one of them is a decision the code makes silently.

1. **`REQ-KG-GATE-01` already requires the behaviour I nearly restated.** It says *every path that
   writes the graph also stamps `knowledge-graph.sources.json`* — which is precisely what `build.ts`
   and `sync.ts` do. But `KG_GATE.md`'s `governs:` lists only `check.ts` and `sources.ts`, so the
   requirement never reaches the two files that implement it. **The gap is governance, not a missing
   requirement.** Extending `KG_GATE.md`'s `governs:` is probably right, and drafting a duplicate here
   would have created a second statement of one rule — the contradiction this tool exists to prevent.
   I did not do it: which doc owns a file is yours.

2. **Why 24 hours?** `sync.ts` warns when recorded results are older than 24h. The number is a literal
   with no stated rationale. `REQ-KG-PIPE-03` deliberately says "a staleness threshold" rather than
   inventing a justification for a number I found in code.

3. **`build.ts` has no entrypoint guard at all** — it executes on import, while `sync.ts`, `check.ts`,
   `recordRun.ts` and `shotsUpload.ts` all guard with some form of `isMain`. That is the same subject
   as the filed contradiction *"how a module decides it is the process entrypoint"*, and `build.ts` is
   a fourth position on it: none.

4. **Three entrypoints treat the ratchet three ways** — `build` ignores it, `sync` reports it, `check`
   blocks on it. `REQ-KG-PIPE-02` records that as intended because §9c argues report-only is
   decoration and the gate must block somewhere. But `build` staying silent is a choice nobody wrote
   down, and it is the command people actually run.

5. **Almost none of `sync.ts` is testable.** Everything but `ageHours` lives inside the `isMain` block,
   so no test can reach it — which is why these requirements have no covering test and why this file
   sat ungoverned. Extracting the body into a callable function is the obvious fix and it is a
   behaviour change to ungoverned code, so it needs a requirement first.

Parent: [[knowledge-graph-tool]]
