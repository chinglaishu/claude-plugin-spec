---
slug: kg-subprocess
title: Shelling out — git history, run scoping, and the tool's own assets
lens: workflow
domain: dev-tooling
status: draft
governs:
  - src/gitDates.ts
  - src/runGrep.ts
  - src/toolDir.ts
  - src/isMain.ts
requirements:
  - id: REQ-KG-SUB-01
    text: A repo the tool cannot read git history for contributes no dates and never
      fails the build — a missing git binary, a directory that is not a
      checkout, and a git invocation that errors are all tolerated per repo, so
      the graph builds on a machine with no git at all.
  - id: REQ-KG-SUB-02
    text: Dates are derived per owning repo, against that repo's own root and with
      the repo prefix stripped, because a workspace's nested repos are separate
      checkouts that share no history.
  - id: REQ-KG-SUB-03
    text: File paths are passed to git in bounded chunks rather than one invocation,
      so a large repo cannot exceed the platform's command-line length limit,
      and the chunks' output is concatenated before parsing because each chunk
      covers a disjoint path set.
  - id: REQ-KG-SUB-04
    text: A scoped test run passes its case filter through an environment variable
      rather than argv, and an unscoped run passes no filter at all, so a large
      scope cannot overflow the platform's command-line limit and silently
      produce no report.
  - id: REQ-KG-SUB-05
    text: Assets the tool ships are resolved relative to the tool's own package, and
      everything a project owns is resolved from its configured artifact
      directory — the two are never the same path, however the tool was
      installed.
  - id: REQ-KG-SUB-06
    text: A module decides it is the process entrypoint one way, in one shared
      helper — comparing its own URL to the file URL of the invoked script, and
      yielding false rather than throwing when no script was invoked. No
      entrypoint decision is made by string-concatenating a file URL or by
      matching a filename suffix, because both answer wrongly on a path that
      needs URL encoding.
    covers:
      - main:src/isMain.test.ts
    # APPROVED by the CEO on 2026-07-26 as the canonical position of conflict
    # cf-4b6d6187fc, which found six CLI modules answering this one question three ways.
    # This requirement carries a decision even though the doc around it is still a draft:
    # the other five requirements here are read off the code and unapproved, this one is not.
---

## Drafted from code, not yet approved

Read from `src/gitDates.ts`, `src/runGrep.ts` and `src/toolDir.ts` on 2026-07-24 by `kg-draft-spec`.
Each requirement records what the implementation currently does. **Nothing here has been decided by a
human**, and a requirement read off an implementation cannot contradict it.

Unusually, four of these five are *documented* in the code's own header comments with the incident that
produced them — a `git log` stdin form unsupported on git 2.32, and a Windows argv overflow that made
Playwright emit no report. That is the code carrying its own rationale, which is what made these
drafts worth writing rather than guessing at.

## Open questions for the CEO

1. **Two different command-line-limit defences, two different mechanisms.** `gitDates.ts` chunks
   argv; `runGrep.ts` moves the payload into an env var. Both solve the same problem, and neither
   file mentions the other. Is one of them the intended pattern?

2. **`REQ-KG-SUB-01` makes git absence silent.** A repo with no git contributes no dates and says
   nothing about it, so a graph missing every date looks identical to a graph whose files are
   genuinely undated. Tolerating the failure is clearly right; staying quiet about it may not be.

3. **`src/types.ts` is still ungoverned and I did not draft it.** It declares types and no behaviour,
   so there is nothing to state that a test could ever prove. Either the gate should not expect a
   requirement for a declaration-only file, or `types.ts` should stay grandfathered forever. That is
   the same shape as the open `unverified-doc` question about a doc that declares no requirements.

4. **`REQ-KG-SUB-04` describes the fix, not the rule.** The code knows *why* — an overflowed argv made
   Playwright produce no report at all, so the run failed silently. The requirement as drafted says
   what to do; it does not forbid the class of failure. Worth strengthening to "a scoped run never
   fails silently" if that is the actual promise.

Parent: [[knowledge-graph-tool]]
