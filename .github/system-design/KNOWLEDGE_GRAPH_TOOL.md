---
id: knowledge-graph-tool
title: "Knowledge & Test Graph — Tool PRD"
lens: workflow
domain: dev-tooling
status: current
entrypoint: true
governs: [tools/knowledge-graph/]
requirements:
  - id: REQ-KG-01
    text: The committed graph always matches a rebuild from source — nothing in knowledge-graph.json, viewer.html, report.md, or digest/ can drift from what a fresh build produces.
    covers: [main:tools/knowledge-graph/src/check.test.ts]
  - id: REQ-KG-02
    text: A new e2e spec cannot land without a linked case entry carrying at least one of verifies/covers/tags — a bare, untracked Playwright test is flagged, not silently ignored.
    covers: [main:tools/knowledge-graph/src/untrackedE2e.test.ts]
  - id: REQ-KG-03
    text: Test statuses in the graph come only from a recorded Playwright/pytest run (kg-test-results.json), never from hand-edited status fields — a test's status always traces back to an actual execution.
    covers: [main:tools/knowledge-graph/src/parseResults.test.ts, main:tools/knowledge-graph/src/resultsFile.test.ts]
  - id: REQ-KG-04
    text: "`check` is the strict gate: any issue kind whose count rises above its frozen baseline fails the build, even by one — a regression cannot be waved through."
    covers: [main:tools/knowledge-graph/src/check.test.ts]
  - id: REQ-KG-05
    text: Run screenshots are stored outside the committed graph at exactly one declared destination — a project-supplied S3 bucket, the tool-managed GitHub evidence branch, or the local device when none is declared. The config names coordinates only and never a credential. Evidence is addressed by URL; screenshot binaries never enter the committed graph JSON or the working branch.
    covers: [main:src/applyEvidence.test.ts]
  - id: REQ-KG-06
    text: A system-design doc's markdown sections are classified deterministically (requirement / decision / open-question / knowledge) from content alone, so the viewer can navigate and tag them without any hand-authored per-section metadata.
    covers: [main:tools/knowledge-graph/src/parseDoc.test.ts]
  - id: REQ-KG-CTX-01
    text: "Given any file path in a project, the agent-context pack lists that path's governing docs, the requirements they specify, the tests covering those requirements, and any conflicts touching them — resolved from the project's own graph and config, knowing nothing about any particular project's layout. When nothing governs the path, the pack halts rather than warning."
    covers: [main:src/agentContext.test.ts]
  - id: REQ-KG-07
    text: "A doc is identified by its frontmatter `slug` when it declares one, falling back to `id` and then the filename — so a corpus that carries a catalog id (SD-nn) alongside a human slug stays cross-referenceable by the name its siblings actually cite."
    covers: [main:tools/knowledge-graph/src/parseDoc.test.ts]
  # --- Gate enforcement (§9). Promoted from staged prose as each test lands, per §7. ---
  - id: REQ-KG-GATE-01
    text: "Every path that writes the graph also stamps `knowledge-graph.sources.json` with the exact sibling-repo commits it was built from, and warns — without blocking — on a pin CI could not fetch, so the inner loop stays usable while the lockfile never silently disagrees with the graph beside it."
    covers: [main:tools/knowledge-graph/src/sources.test.ts]
  - id: REQ-KG-GATE-02
    text: "`check --pinned` refuses to certify a graph unless the sibling checkouts sit exactly at the lockfile's commits, and a missing or malformed lockfile is refused rather than guessed at — so a `fresh ✓` verdict always means reproducible-from-pins, never merely that the graph happened to match one machine's checkout."
    covers: [main:tools/knowledge-graph/src/sources.test.ts]
  # --- Tool-surface backfill (2026-07-10): serve / SSE / route security ---
  - id: REQ-KG-SERVE-01
    text: "The /api/live SSE hub coalesces a burst of graph-rebuild notifications into exactly one debounced graph-updated broadcast, delivers it only to still-connected clients, keepalives idle ones, and evicts any client on socket close or a throwing write — one rebuild yields one re-fetch and no client leaks."
    covers: [main:tools/knowledge-graph/src/liveHub.test.ts]
  - id: REQ-KG-SERVE-02
    text: "Every read-only serve route (/registry, /src, /run-artifacts, /shots) confines each read within its designated root, rejecting raw and URL-encoded traversal, backslashes, absolute or drive-letter paths, dotfiles, .local. credential files, and non-allowlisted extensions with a 404."
    covers: [main:tools/knowledge-graph/src/pathGuard.test.ts, main:tools/knowledge-graph/src/serveProvenance.test.ts, main:tools/knowledge-graph/src/serveRunArtifact.test.ts]
  - id: REQ-KG-SERVE-03
    text: "/api/graph returns the current graph read fresh from disk on every request (a rewrite is served on the next fetch) and 404s a missing file."
    covers: [main:tools/knowledge-graph/src/serveGraph.test.ts]
  - id: REQ-KG-SERVE-04
    text: "Star curation writes back only the targeted feature entry — depth-anchored, idempotent, never matching a prefix or substring sibling or a nested star key, and throws on an unknown id."
    covers: [main:tools/knowledge-graph/src/toggleStar.test.ts]
  - id: REQ-KG-SERVE-05
    text: "The serve spawn-lock enforces single-owner server management — a lock held by a live process yields contended (no double-spawn), a stale, dead-owner, or corrupt lock is atomically reclaimed with the wx flag, and release only removes the caller's own lock."
    covers: [main:tools/knowledge-graph/src/serveLock.test.ts]
  - id: REQ-KG-SERVE-06
    text: "A run client disconnect is detected via the ServerResponse close event (not the request) and tree-kills the spawned run, guarded by an exited flag so normal completion never fires a kill."
    covers: [main:tools/knowledge-graph/src/serverDisconnect.test.ts]
  # --- Tool-surface backfill: run pool / results ---
  - id: REQ-KG-RUN-01
    text: "A scoped run (--flow or --case) upserts only the cases it executed into kg-test-results.json, leaving untouched cases' status, attempts, and at intact; a full run replaces the map."
    covers: [main:tools/knowledge-graph/src/resultsFile.test.ts, main:tools/knowledge-graph/src/lastRunPipeline.test.ts]
  - id: REQ-KG-RUN-02
    text: "Each result entry is stamped with the commit and timestamp of the run that produced it (per-entry), so a scoped re-record overwrites only its own entries' provenance and untouched or pre-schema entries keep — and never fabricate — their commit, at, and error."
    covers: [main:tools/knowledge-graph/src/resultsFile.test.ts, main:tools/knowledge-graph/src/lastRunPipeline.test.ts]
  - id: REQ-KG-RUN-03
    text: "Only cases explicitly marked parallelSafe true join the concurrency pool (bounded by a clamped, at-least-1 integer); every other case is serialized, with input order preserved in both lists."
    covers: [main:tools/knowledge-graph/src/runSchedule.test.ts]
  - id: REQ-KG-RUN-04
    text: "A spawned Playwright run is terminated as a whole process tree (taskkill /T /F on Windows, SIGTERM on POSIX) so no orphaned worker or headed browser survives a cancelled or closed run."
    covers: [main:tools/knowledge-graph/src/treeKill.test.ts]
  - id: REQ-KG-RUN-05
    text: "A run only spawns after a frontend and backend readiness gate — proceeding when healthy or when nothing is wedged, waiting within the timeout window, and giving up with an honest serverNotReady past the timeout, never a silent hang or a fabricated result."
    covers: [main:tools/knowledge-graph/src/gateDecision.test.ts]
  # --- Tool-surface backfill: evidence / screenshot token tier ---
  - id: REQ-KG-EVID-01
    text: "A raw.githubusercontent.com evidence URL is deterministically rewritten into a GitHub Contents API URL with each path segment and the ref URL-encoded (slashes preserved); an already-API URL passes through, and any non-raw or malformed URL returns null so the viewer falls through to the local or placeholder tiers instead of firing an authenticated fetch at a bad target."
    covers: [main:tools/knowledge-graph/src/evidenceUrl.test.ts]
  - id: REQ-KG-EVID-02
    text: "Contents-API base64 content is stripped of GitHub's 60-char line wraps and shaped into a data:image/png;base64 URL (empty or non-string content becomes null), consumed only as an img src and never injected as HTML."
    covers: [main:tools/knowledge-graph/src/evidenceUrl.test.ts]
  - id: REQ-KG-EVID-03
    text: "The evidence index keys each case's shots map by the original bare screenshot filename (the exact string a step's screenshot carries), confining the remote ordinal prefix to the URL path, so the viewer's exact evidence-by-filename lookup resolves."
    covers: [main:tools/knowledge-graph/src/shotsUpload.test.ts]
  - id: REQ-KG-EVID-04
    text: "Ingesting the evidence index attaches the shot-URL map only onto e2e-kind nodes matched by case-insensitive bare id, never a non-e2e node on a bare-id collision; a missing or malformed index leaves the graph unchanged (deterministic)."
    covers: [main:tools/knowledge-graph/src/applyEvidence.test.ts]
  # --- Tool-surface backfill: viewer / delta / digest / health ---
  - id: REQ-KG-VIEW-01
    text: "The since-last-sync delta is injected only at the real __KG_DELTA__ template markers in the post-data tail — never at a marker string inside the inlined graph JSON — and a build passed no delta leaves the region null."
    covers: [main:tools/knowledge-graph/src/viewer.test.ts]
  - id: REQ-KG-VIEW-02
    text: "The delta reports, versus the previously committed graph, nodes added and removed grouped and sorted by type, test pass and fail transitions only for ids present in both graphs, and only the issue kinds whose count changed; the first sync yields no delta."
    covers: [main:tools/knowledge-graph/src/delta.test.ts]
  - id: REQ-KG-VIEW-03
    text: "digest/ is derived purely from the graph as exactly one markdown file per flow plus an index, each requirement shown as proven only when a covers-edge test or a provenBy slug resolves to a real test node, otherwise flagged as having no covering test."
    covers: [main:tools/knowledge-graph/src/digest.test.ts, main:tools/knowledge-graph/src/summarize.test.ts]
  - id: REQ-KG-VIEW-04
    text: "A flow's health lastVerified is the oldest runAt among its tagged e2e tests (worst-case honesty, not the newest), and a test tagged into features of more than one flow is counted once in the health totals."
    covers: [main:tools/knowledge-graph/src/summarize.test.ts]
  # --- Tool-surface backfill: build core / discovery / tags / links ---
  - id: REQ-KG-CORE-01
    text: "A bare cross-reference resolves only when exactly one namespaced id shares its slug (auto-resolved); a slug matching two or more nodes is ambiguous-link and one matching zero is broken-link, and only node-target edges are link-validated (code-path edges like governs or exercises are never broken-link)."
    covers: [main:tools/knowledge-graph/src/buildGraph.test.ts]
  - id: REQ-KG-CORE-02
    text: "Every path-bearing node id is namespaced repo:bare with repo classified purely by path prefix (dojostack_backend to backend, dojostack_frontend to frontend, else main), and auto-generated requirement ids embed the namespaced feature id, so the same authored id in two repos can never collide."
    covers: [main:tools/knowledge-graph/src/repo.test.ts, main:tools/knowledge-graph/src/parseFeatures.test.ts, main:tools/knowledge-graph/src/parseConfig.test.ts]
  - id: REQ-KG-CORE-03
    text: "A unit test's feature membership is derived by glob-matching its path against registered feature paths — a file under no feature derives none; e2e tests are never glob-derived (they carry explicit features), and a features.yaml registry emits zero tag edges of its own."
    covers: [main:tools/knowledge-graph/src/deriveTags.test.ts, main:tools/knowledge-graph/src/parseFeatures.test.ts]
  - id: REQ-KG-CORE-04
    text: "Each discovered source file is routed to exactly one parser by path pattern (else ignored), and only files matching the unit-test globs (including the tool's own src tests) are unit-test candidates — a non-test file in a matched directory is never indexed, keeping the graph bounded."
    covers: [main:tools/knowledge-graph/src/discover.test.ts]
  - id: REQ-KG-CORE-05
    text: "A requirement is proven only via an inbound covers edge or a provenBy slug resolving to a real test node (else uncovered-requirement); a doc is unverified-doc unless a test verifies it or every requirement it specifies is independently proven — the self-proven escape can never launder a doc with zero or any unproven requirement."
    covers: [main:tools/knowledge-graph/src/buildGraph.test.ts]
  # --- Conflicts feature (promoted as Phase-1a tests land; 03/06/07/08/09 still staged) ---
  - id: REQ-KG-CONF-01
    text: "A conflict finding models one subject with at least two participants grouped into at least two positions (camps); a finding failing that cluster invariant is rejected, and the binary case is simply N=2 with no special-casing."
    covers: [main:tools/knowledge-graph/src/conflictModel.test.ts]
  - id: REQ-KG-CONF-02
    text: "The scan's comparison surface is enumerated deterministically from the graph's own edges (references for doc-doc, governs for doc-code, covers for requirement-test); two nodes with no connecting edge never become a candidate pair, so the AI adjudicates a bounded set and never free-hunts the tree."
    covers: [main:tools/knowledge-graph/src/conflictCandidates.test.ts]
  - id: REQ-KG-CONF-04
    text: "graph.conflicts is a viewer-only payload deduped by content id and sorted, adding no nodes, edges, or issues (zero ratchet impact), so the same source findings always fold to byte-identical output."
    covers: [main:tools/knowledge-graph/src/parseConflicts.test.ts, main:tools/knowledge-graph/src/conflictsBuild.test.ts]
  - id: REQ-KG-CONF-05
    text: "A finding's identity is a stable hash of subject plus scope, so a re-scan of the same subject in the same scope yields the same id — the basis for dismissals and resolutions surviving a re-scan."
    covers: [main:tools/knowledge-graph/src/conflictId.test.ts]
  - id: REQ-KG-CONF-03
    text: "Contradiction adjudication runs out-of-platform (the kg-scan-conflicts skill); the viewer template and the serve process never call an AI SDK or invoke a model."
    covers: [main:tools/knowledge-graph/src/noAiInViewerServe.test.ts]
  - id: REQ-KG-CONF-06
    text: "Resolving a finding is choosing one canonical position; every non-canonical participant is then a target for a fix, a dissenting doc as a text edit and dissenting code via TDD plus the code-review gate, and only resolved findings produce a fix plan."
    covers: [main:tools/knowledge-graph/src/conflictFixPlan.test.ts]
last_reviewed: 2026-07-10
---

## 0. Purpose

`tools/knowledge-graph/` turns the scattered, easy-to-drift sources of truth about DojoStack —
system-design docs, e2e case registries, feature registries, unit/e2e test files, config/instruction
files — into one committed, machine-checkable graph (`knowledge-graph.json`), a browsable viewer
(`viewer.html`), a human digest (`digest/*.md`), and a short status report (`report.md`). This
document is the tool's own product-requirements spec: what it must always be true, indexed into the
same graph it produces (the tool eating its own dog food — this doc's requirements are proven by the
tool's own Vitest suite, not by assertion).

The problem this tool solves: without it, "is this requirement actually tested?", "is this doc still
read by anything?", and "did this e2e test get wired up correctly?" are all questions a human has to
answer by grep and memory, and the answer silently rots as the codebase changes. The graph makes those
questions machine-answerable and machine-enforceable (`npm run check`), and cheap enough to run in
every session.

## 1. Derive-from-source principle

**Nothing in the graph is hand-authored data about the codebase — it is always parsed FROM the
codebase.** Every node and edge traces back to one committed source file:

- A `doc` node comes from a system-design/instruction markdown file's frontmatter + body.
- A `test` node (`kind: e2e`) comes from a `*.cases.yaml` entry; a `test` node (`kind: unit-fe` /
  `unit-be`) comes from a real `*.test.ts(x)` / `test_*.py` file that matches a registered feature's
  path globs.
- A `feature` node and its `requirement` children come from a `*.features.yaml` registry entry, or a
  `requirements:` block in a doc's frontmatter.
- A `test` node's **status** comes only from `kg-test-results.json`, written by an actual Playwright/
  pytest run — never edited by hand (REQ-KG-03).
- A `test` node's (e2e) **evidence** (screenshot URLs) comes only from `kg-evidence-index.json`,
  itself generated by uploading real captured PNGs — never a hand-typed URL (REQ-KG-05).

This is why `npm run check` can assert **freshness**: rebuild from the same source files and byte-
compare against what's committed (REQ-KG-01). If the rebuild differs, the committed graph is stale —
by definition, a fact about the codebase changed and the graph wasn't regenerated.

## 2. The four generated views

| View | File | Purpose |
| --- | --- | --- |
| Graph | `knowledge-graph.json` | The canonical machine-readable node/edge/issue list. Every other view is derived from this. |
| Viewer | `viewer.html` | A single-file, no-build-step HTML page (rendered from `viewer.template.html` + the graph) for browsing docs, features, tests, and requirements interactively, plus a live "▶ Run" panel (see §4). |
| Report | `report.md` | A short, git-diffable status summary — node/edge/issue counts and the issue list — for a quick "what changed" read without opening the viewer. |
| Digest | `digest/*.md` | One markdown file per flow (`digest/<flow>.md`) plus an index, listing that flow's requirements with proof status and gaps — the "what's actually covered" view for a specific product area. |

## 3. Commands

| Command | What it does | Blocks? |
| --- | --- | --- |
| `npm run sync` | Rebuilds from source and **always** writes fresh artifacts (graph, viewer, report, digest), then reports the issue-ratchet delta informationally. Meant to be run after any change to a source file the graph indexes, and safe to run repeatedly. | Never — always exits 0. |
| `npm run sync:results` | Runs the Playwright cases in scope (`--flow`/`--case`, or everything), records results into `kg-test-results.json`, invokes the evidence auto-upload for the cases just run (§5), then chains `sync`. | Only on a genuine internal failure to produce a report; a failing *test* is still recorded, not a tool failure. |
| `npm run check` | Rebuilds from source and asserts the committed graph + viewer are byte-identical to a fresh rebuild (REQ-KG-01), then asserts no issue kind rose above its frozen baseline (REQ-KG-04, `knowledge-graph.baseline.json`). | Yes — this is the CI/pre-merge gate. |
| `npm run build` | One-shot rebuild + artifact write, no ratchet reporting — used for local iteration. | Never. |
| `npm run serve` | Companion dev server: serves the viewer, a `/shots/<caseId>/<file>` route for local screenshot preview, `/api/star` (curate features), and `/api/run` (spawn a scoped Playwright run with live SSE log streaming into the viewer's Run panel). | N/A (long-running dev server). |
| `npm run shots:upload` | Uploads locally captured e2e screenshots to the `e2e-evidence` branch and regenerates `kg-evidence-index.json` (§5). `--case <ids>` scopes it; `--dry-run` previews with no network calls. | Never; a failed upload warns loudly rather than throwing. |

## 4. Run pipeline (summary)

`serve`'s `/api/run` spawns a scoped Playwright run (one case, a flow, or everything) and streams
`start` / `log` / `status` / `serverNotReady` / `exit` events over SSE into the viewer's Run panel, so
a user can trigger and watch a real test run without leaving the browser. It gates on frontend/backend
readiness before spawning anything (never blindly reusing a wedged dev server), tracks its own spawn
lock so two `serve` instances never race to start duplicate app servers, and tree-kills the whole
process group on client disconnect or run abort. Full behavioural contract lives in
`serve.ts` itself and the run-pipeline design doc (`2026-07-05-kg-viewer-ux-runinfra-design.md`,
workspace root, not committed to a repo) — this PRD only asserts the product-level requirement that a
run's outcome is always either a real pass/fail/flaky or an honest "servers weren't ready" explanation,
never a silent hang or a fabricated result.

## 5. Evidence storage

> **Rewritten 2026-07-24 (CEO).** This section used to mandate the `e2e-evidence` orphan branch as
> *the* destination. It is now **one of three**, declared as exactly one `evidence` destination in
> `kg.config.json`:
>
> | kind | where shots go | shared baseline? |
> |---|---|---|
> | `blob` | a project-supplied S3 bucket + prefix | yes |
> | `github` | the tool-managed `e2e-evidence` orphan branch (§5a) | yes — with no bucket to provision |
> | *omitted* | the local device, under `shotsDir` | **no** |
>
> ```json
> "evidence": { "kind": "blob", "bucket": "acme-kg", "prefix": "kg-cases", "region": "us-east-1" }
> ```
>
> **Coordinates only — never a credential.** `kg.config.json` is committed, so a signed URL or an
> access key placed here would enter git history permanently; those keys are *refused*, not ignored.
> Credentials resolve at run time from the standard AWS chain (env vars, `~/.aws`, instance role, or
> CI's OIDC-minted short-lived creds), so no long-lived secret need exist at all.
>
> A pre-signed URL was considered and rejected: one URL signs exactly one object key, while a run
> uploads many keys not known until it happens; and the evidence index is committed, so its URLs must
> outlive the short expiry a pre-signed URL carries.
>
> Modelled as one declared destination rather than several optional fields on purpose: a config that
> could set both a blob URL and a repo would have no defined winner, and something downstream would
> silently pick one — the exact contradiction this tool exists to detect.
>
> The invariant that actually mattered is unchanged and now **enforced** rather than merely asserted:
> binaries never enter the committed graph (`referencesOnly` in `applyEvidence.ts`).
>
> **Known cost, recorded rather than discovered later:** flow-approval (founding design §6) diffs a
> *previous* screenshot against a new one. Local storage gives CI and a second machine no shared
> baseline, so that feature needs `blob` or `github`.

## 5a. The GitHub evidence branch (layout contract)

Screenshots captured during e2e runs are never committed on the working branch and never embedded as
binaries in `knowledge-graph.json` — only URLs are (REQ-KG-05). They are uploaded to a dedicated
orphan branch, `e2e-evidence`, in `dojostack_frontend`, laid out as
`kg-cases/<caseBareId>/<shortSha>/<NN>-<shotName>.png` with the newest 3 SHAs per case retained (older
ones pruned on every upload) — see that branch's own `README.md` for the full contract. The upload
path (`tools/knowledge-graph/src/shotsUpload.ts`) is invoked automatically at the end of
`sync:results` for the cases just run (`KG_SHOTS_UPLOAD=0` to disable) and can be run manually via
`npm run shots:upload`. The resulting `dojostack_frontend/e2e/kg-evidence-index.json` — case id → SHA
→ `{ filename: raw URL }` — is ingested by `discover.ts` the same way `kg-test-results.json` is, and
attached as `evidence` on the matching e2e test node, so the viewer's screenshot strip can resolve a
step's image locally (live `serve` `/shots/` route) or from this branch, in that order.

## 6. Doc section metadata

A system-design doc's H2/H3 headings are classified deterministically into `requirement` / `decision`
/ `open-question` / `knowledge` sections purely from their content — no per-section frontmatter
needed (REQ-KG-06): a section mentioning a `REQ-…` id is a requirement section; one containing
`Decision needed` / `DECISION:` / `Locked decision` is a decision section (taking precedence over a
requirement match, since a section that locks a decision *about* a requirement is documenting the
decision, not defining it); one whose heading or text matches `Open Question(s)` / `OQ-\d+` is an
open-question section; anything else is knowledge. Anchors use a GitHub-style heading slug so the
viewer's in-page links and the anchors GitHub itself generates for the same markdown always agree.
This lets the viewer render per-section chips, a colored left border, and a kind-colored "on this
page" mini-TOC — and lets a requirement card link straight to "Defined in: `<doc>` § `<section>`"
instead of a generic doc reference.

## 7. What's deliberately not claimed here (ratchet honesty)

**`sync` never blocking regardless of ratchet state** (`sync.ts`) is real and important but is
deliberately **not** a `REQ-KG-*` requirement: `sync.ts` has no test file, so this doc cannot honestly
`provenBy` it — matching the tool's own freshness/honesty principle (§1) applied to itself. If
`sync.ts` gains a test asserting its always-exit-0 behavior, promote that prose sentence then.

The run pipeline's **readiness-gate / spawn-lock / tree-kill** mechanics were previously excluded here
on the same "no asserting test" grounds. That was outdated: they *are* asserted by real unit tests
(`gateDecision.test.ts`, `serveLock.test.ts`, `serverDisconnect.test.ts`, `treeKill.test.ts`), so as
of 2026-07-10 they are **promoted** to `REQ-KG-RUN-05`, `REQ-KG-SERVE-05`, `REQ-KG-SERVE-06`, and
`REQ-KG-RUN-04`. (The `KG_ORCHESTRATE` opt-out in `ensureOrchestrated.ts` stays prose — minor env glue.)

### Known uncovered invariants (tracked, not faked as requirements)

Real invariants with no unit test today. Per §1 they are listed here rather than wired to a `covers:`
edge whose test doesn't assert them (which would launder coverage):

1. The read-only fine-grained PAT + token-fetch DOM glue in `viewer.template.html` (sessionStorage
   only, never baked into `viewer.html`) — no unit test; the build-determinism half is REQ-KG-01.
2. Live-refresh re-renders in place, never `location.reload()`, preserving UI state — client JS in
   `viewer.template.html`; needs a DOM/Playwright test to become falsifiable.
3. `flaky = (status pass AND attempts > 1)` derivation in `syncResults.ts` — untested (its input,
   attempts counting only executed results, is covered by `parsePlaywrightReport.test.ts`).
4. The `E2E_KG_NO_AUTO` record-once guard (stops the frontend reporter double-recording) — untested
   spawn/env glue.
5. buildGraph's end-to-end skip-gates (an unregistered unit-test file is skipped; a parser that throws
   is warned and skipped) — the predicates are tested, the wiring is not.

## 8. Conflict-Resolution feature (planned — spec-first, requirements staged)

A planned feature: detect and resolve **semantic contradictions** — one fact stated inconsistently
across docs and/or code (a formula, an ordering, a definition) — which the structural issue kinds do
not catch. This is the automation of the manual "portfolio docs tidy" (npi_margin denominator, overlay
composition order, occupancy weighting). Shape:

- A finding is a **cluster**: one `subject` described by N participants grouped into `positions`
  (camps); the binary case is N=2. `axis` (doc / code / mixed) is derived from participant kinds, so
  multi-doc, multi-code, and mixed contradictions share one model.
- **Scan** (`kg-scan-conflicts --flow <f>`) runs AI adjudication **out of platform** (like the
  `kg-e2e` runner) over comparison candidates the graph enumerates from its own edges
  (`related` / `governs` / `specifies`+`covers`, plus same-scope co-membership); results fold into a
  deterministic `graph.conflicts` block. The viewer and serve routes call no AI.
- **Resolve** by picking one canonical position; non-canonical participants are fixed by type —
  dissenting docs as text edits, dissenting code via TDD + the code-review gate. Triage decisions live
  in a separate, non-deterministic decisions file (a serve route sibling of `/api/star`). Identity =
  hash(`subject` + `scope`): a dismissed finding never returns on re-scan; a resolved finding re-opens
  iff a new dissenting participant appears.
- **Apply** via a clipboard handoff — the Conflicts tab copies `/kg-fix-conflicts <scope>`; a browser
  page cannot drive the terminal, so it never applies code edits itself.

Its requirements `REQ-KG-CONF-01..09` are promoted into this frontmatter (each with a real `covers:`)
as its test lands, so the strict ratchet (REQ-KG-04) stays green instead of gaining
`uncovered-requirement` issues up front — the same promote-when-tested rule §7 applies to `sync.ts`.
**Phases 1a (data pipeline), 1b (scan skill), 1c (viewer tab + serve decisions) and 2 (fix plan +
kg-fix-conflicts skill) are built**, so `REQ-KG-CONF-01/02/03/04/05/06` are now in the frontmatter
above. `07` (tab groups/filters) and `08` (clipboard) are implemented in `viewer.template.html` and
verified by driving the served viewer, but stay staged until a browser e2e-viewer spec covers them;
`09`'s "code fix writes a failing test first" is enforced by the kg-fix-conflicts skill (not a unit
test), so it also stays staged.

## 9. Gate enforcement (planned — spec-first, requirements staged)

**The gate does not currently enforce anything.** `.github/workflows/knowledge-graph.yml` runs
`npm run check || echo "::warning::…"`; the `||` swallows the exit code, so `check` has never failed a
PR. Measured 2026-07-16, five of seven issue kinds are above the frozen baseline — `broken-link` 37>11,
`orphan-doc` 202>196, `uncovered-requirement` **95>25**, `untracked-e2e` 4>2, `unverified-doc` 267>244 —
and `check` fails at the freshness step before reaching the ratchet at all.

**REQ-KG-04 is therefore currently false**, and it is false in exactly the shape §7's known-uncovered
list already names: *"the predicates are tested, the wiring is not."* Its text claims a regression
"fails the build… cannot be waved through"; its `covers:` is `check.test.ts`, which proves
`ratchetFailures()` **returns** failures. Nothing asserts the **pipeline acts on them**. Per §7's
honesty rule this is a laundered `covers:` edge, and it is being fixed rather than re-labelled: Phase 3
below narrows REQ-KG-01/04 to what is enforced and adds the pipeline test that makes the stronger claim
honest again.

**Root cause (why report-only stuck).** The committed graph is a derived artifact of **three** repos —
it is irreducibly cross-repo (267 `backend→frontend` edges, 56 `main→frontend`, 15 `frontend→main`,
8 `frontend→backend`), so a partial checkout severs ~347 edges and *fabricates* uncovered/broken-link
issues. But the three repos sit on independent branches and the graph pins **no source commits** (only
`lastRun.commit`, describing the test run). A build with no lockfile is not reproducible, so its output
cannot be checked. That, not the missing checkout step, is why the workflow's own comment says "Do NOT
promote this to blocking."

This is also why the `uncovered-requirement` rise is **not** a recent lapse in discipline: the four
backend specs carrying all 70 (`MODULE_HEADER_ACTIONS_AND_GLOSSARY` 30, `FLOOR_PLAN_EDITOR` 15,
`LIVE_FRESHNESS_AND_FREEZE` 14, `VERSION_LIFECYCLE_AND_ARCHIVE` 11) span 2026-06-19 → 2026-07-09, and
the baseline commit `63fbd7b` states the graph was "frozen against an older repo state". The graph
absorbs sibling promises whenever a rebuild runs against a newer checkout, and nothing checks the
result. The fix is a pin, not a memo.

**Shape.** Pin the inputs, which splits one unanswerable question into two answerable ones: *is the
graph a correct build of its pinned inputs?* (reproducible → **blocking** in CI) and *are the pins
current with the siblings?* (a **non-blocking** scheduled signal that opens an advance-the-pins PR).
This is the lockfile pattern — `npm ci` verifies internal consistency; Dependabot separately reports
you are behind. Conflating them is what left the gate off.

Staged requirements, promoted into the frontmatter above with a real `covers:` **as each test lands**,
per §7 — so this section cannot itself add `uncovered-requirement` issues while it is only planned:

- ~~**REQ-KG-GATE-01**~~ — **BUILT + PROMOTED to the frontmatter above** (`sources.ts`,
  `sources.test.ts`; `build` and `sync` both stamp).
  *(Text corrected 2026-07-17 while building it. It first read "refuses to stamp an unpushed commit" —
  and the module written to that text promptly refused on this very workspace. An unpushed sibling HEAD
  is the normal state of feature-branch work, so a blocking build would break the inner loop daily, and
  it contradicted §7's standing split: "`sync` never blocking regardless of ratchet state"; `check` is
  the gate. The invariant is narrower than the first draft assumed — never* **commit** *a lockfile CI
  cannot resolve — so the block belongs at check time (GATE-04), not build time. `sources.ts` now
  reports facts and `unfetchablePins` states the rule once, so the warning and the block can never
  disagree. Scope also widened: `sync` writes the graph too, so it stamps as well — resolving the design
  note's open question 4. A graph whose lockfile disagrees with it is itself a drift source.)*
- ~~**REQ-KG-GATE-02**~~ — **BUILT + PROMOTED** (`check --pinned`; `sources.ts`, `sources.test.ts`).
  *(Narrowed 2026-07-17 to what it uniquely contributes. It first read "CI rebuilds at the pinned
  sibling commits **and fails when the committed graph differs**" — but that second half is REQ-KG-01's
  pre-existing freshness check, and the "CI" half belongs to GATE-03 + the workflow. What is genuinely
  new, and now tested, is the pin assertion: `check --pinned` refuses to certify a graph unless the
  sibling checkouts sit exactly at the lockfile's commits, so a "fresh ✓" verdict always means
  reproducible-from-pins rather than "happened to match this machine". Splitting it that way is not
  trimming the requirement to fit the code — GATE-03 already owned the CI half.)*
- **REQ-KG-GATE-03** — the CI gate propagates `check`'s exit code: no step swallows a stale graph or a
  blown ratchet. *(This is the requirement REQ-KG-04 was believed to have.)*
- **REQ-KG-GATE-04** — an unfetchable pin fails with an actionable rebuild instruction, never a silent pass.
- **REQ-KG-GATE-05** — pin **currency** is reported separately from pin **correctness**, and never blocks a PR.
- **REQ-KG-GATE-06** — a source doc that fails to parse **fails the build**; it is never warned-and-skipped
  into a silently smaller graph.

**REQ-KG-GATE-06 was earned by an incident during this section's own authoring (2026-07-16).** A single
unquoted `[id]` dynamic-route segment inside a YAML flow sequence made
`dojostack_backend/.github/system-design/00_platform/MODULE_HEADER_ACTIONS_AND_GLOSSARY.md` unparseable.
`buildGraph` warned once to the console and skipped it — silently removing **30 requirements** from the
graph (`uncovered-requirement` 95→65, because they ceased to *exist* rather than becoming proven) and
stranding **221** references (`broken-link` 37→258). This is §7's known-uncovered item 5 exactly — *"a
parser that throws is warned and skipped… the predicates are tested, the wiring is not"* — so the hole
was known, documented, and unclosed. A `console.warn` is not a gate: the SSoT lost 30 promises and every
downstream reader, human or agent, would have seen a smaller graph and believed it.

The same incident is also the sharpest evidence for the pin: the doc parsed cleanly during a probe one
hour earlier and broke when a concurrent agent pulled the backend repo mid-session, moving the graph's
inputs underneath an in-flight build. Three different "correct" graphs in one session.

**Phases** (mechanism → debt → flip, so CI is never red):

| Phase | What | Repo(s) | Exit condition |
|---|---|---|---|
| **1 — Mechanism** | Lockfile + build stamp + `check --pinned` + 3-repo CI checkout. **Stays report-only** — but the report becomes reproducible, hence trustworthy for the first time. | main | one green pinned comparison on ubuntu |
| **2 — Debt** | §7 promote-when-tested on the 4 specs (frontmatter → staged prose); register 2 untracked e2e; triage `broken-link` +26; documented raise for `orphan-doc` 196→202 and `unverified-doc` 244→267 only | backend, frontend, + main rebuild | all 7 kinds at or under baseline |
| **3 — Flip** | Drop `\|\| echo`; narrow REQ-KG-01/04; add the pipeline tests; pin-currency job | main | `check` blocking and green; REQ-KG-04 true |

**`uncovered-requirement` is never raised** — raising it to 95 would concede the exact regression the
ratchet exists to refuse. It is paid down by §7 promotion, which writes no tests up front and fakes
nothing: it restores the distinction between a *staged intention* and a *ratified, proven* requirement.

**Lead risk — RETIRED 2026-07-17.** The whole design rests on "rebuild at the pins → compare
byte-for-byte", and that comparison had **never once passed on any platform** (the gate has been
report-only its entire life). Spiked before building anything: `buildGraph()` at a pinned timestamp,
normalized exactly as `check.ts` does, SHA256'd, run natively and in `node:20` containers —
**darwin arm64, linux arm64 and linux x64 (`ubuntu-latest`'s arch) all produce a byte-identical graph**
(1392 nodes / 1965 edges / 13,578,939 bytes / `0de872d2c697…c198c`). So REQ-KG-GATE-02 is implementable
and the fallback layered design is not needed. The hazards reasoned about up front all held:
`assemble()`'s canonical sort keeps glob order out, `normalizeForCompare` absorbs git-history
differences, Node 20 is pinned both sides. Residual: the spike bind-mounted a case-insensitive macOS
filesystem, so a true ext4 checkout is still untested — small, since every filename in the tree is
canonical and `fast-glob` matches case-sensitively in userspace, and the first real CI run closes it.
This proves the build is deterministic, **not** that the pin mechanism works — that is still Phase 1.

**Open questions:** (1) fine-grained PAT vs GitHub App for the sibling checkout — note §7's
known-uncovered item 1 records a read-only fine-grained PAT already in use for the viewer's token glue,
so that is the precedent; (2) scheduled pin-currency vs sibling `repository_dispatch`; (3) the
one-command recovery when a pin is rebased away; (4) whether `sync.ts` needs the same pinning;
(5) the 19 `uncovered-requirement` nodes with **no governing-doc edge** are unattributed — possibly a
modelling gap rather than debt.

Full design note: `docs/superpowers/specs/2026-07-16-kg-gate-pinned-sources-design.md` (pre-ratification
scaffolding; not in the graph by design — see §1).

## 10. Open questions

- Should `check`'s ratchet baseline be per-repo (main/frontend/backend) instead of one flat file, now
  that the tool indexes its own `tools/knowledge-graph/` sources under the `main:` namespace
  alongside the two app repos? Not urgent — the baseline already tracks total counts correctly; this
  is only about attribution clarity if the flat total grows harder to read.
- Should the digest gain a fifth view — a per-tool "self-coverage" digest analogous to the per-flow
  ones — now that the tool has its own `kg.tool` feature and unit-test population? Deferred until
  there's a second dev-tool in the workspace to make the pattern worth generalizing.
