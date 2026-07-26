# Platform & docs — knowledge digest (synced 2026-07-26, results never)

Capabilities: 0 · with tests: 0 · promises: 53 (proven 43)

## Requirements
- REQ-KG-01: The committed graph always matches a rebuild from source — nothing in knowledge-graph.json, viewer.html, report.md, or digest/ can drift from what a fresh build produces.
  Proven by: check.test.ts (unit-fe, pass)
- REQ-KG-02: A new e2e spec cannot land without a linked case entry carrying at least one of verifies/covers/tags — a bare, untracked Playwright test is flagged, not silently ignored.
  Proven by: untrackedE2e.test.ts (unit-fe, pass)
- REQ-KG-03: Test statuses in the graph come only from a recorded Playwright/pytest run (kg-test-results.json), never from hand-edited status fields — a test's status always traces back to an actual execution.
  Proven by: parseResults.test.ts (unit-fe, pass)
- REQ-KG-04: `check` is the strict gate: any issue kind whose count rises above its frozen baseline fails the build, even by one — a regression cannot be waved through.
  Proven by: gateDecision.test.ts (unit-fe, pass)
- REQ-KG-05: Run screenshots are stored outside the committed graph at exactly one declared destination — a project-supplied S3 bucket, the tool-managed GitHub evidence branch, or the local device when none is declared. The config names coordinates only and never a credential. Evidence is addressed by URL; screenshot binaries never enter the committed graph JSON or the working branch.
  Proven by: applyEvidence.test.ts (unit-fe, pass) · blobStore.test.ts (unit-fe, pass) · serveEvidence.test.ts (unit-fe, pass)
- REQ-KG-06: A system-design doc's markdown sections are classified deterministically (requirement / decision / open-question / knowledge) from content alone, so the viewer can navigate and tag them without any hand-authored per-section metadata.
  Proven by: parseDoc.test.ts (unit-fe, pass)
- REQ-KG-07: A doc is identified by its frontmatter `slug` when it declares one, falling back to `id` and then the filename — so a corpus that carries a catalog id (SD-nn) alongside a human slug stays cross-referenceable by the name its siblings actually cite.
  Proven by: parseDoc.test.ts (unit-fe, pass)
- REQ-KG-CONF-01: A conflict finding models one subject with at least two participants grouped into at least two positions (camps); a finding failing that cluster invariant is rejected, and the binary case is simply N=2 with no special-casing.
  Proven by: conflictModel.test.ts (unit-fe, pass)
- REQ-KG-CONF-02: The scan's comparison surface is always enumerated, never free-hunted. Doc-anchored pairs come from the graph's own edges (references for doc-doc, governs for doc-code, covers for requirement-test), and code-to-code pairs come from a shared declared-symbol index over the project's source files, bounded to symbols declared in at least two files and in few enough files to be distinctive. Two files sharing no declared symbol never become a candidate pair, and a repo carrying no docs at all still yields a bounded surface.
  Proven by: codeCandidates.test.ts (unit-fe, pass) · conflictCandidates.test.ts (unit-fe, pass) · conflictCli.test.ts (unit-fe, pass) · freshInstall.test.ts (unit-fe, pass)
- REQ-KG-CONF-03: Contradiction adjudication runs out-of-platform (the kg-scan-conflicts skill); the viewer template and the serve process never call an AI SDK or invoke a model.
  Proven by: noAiInViewerServe.test.ts (unit-fe, pass)
- REQ-KG-CONF-04: graph.conflicts is a viewer-only payload deduped by content id and sorted, adding no nodes, edges, or issues (zero ratchet impact), so the same source findings always fold to byte-identical output.
  Proven by: parseConflicts.test.ts (unit-fe, pass)
- REQ-KG-CONF-05: A finding's identity is a stable hash of subject plus scope, so a re-scan of the same subject in the same scope yields the same id — the basis for dismissals and resolutions surviving a re-scan.
  Proven by: conflictId.test.ts (unit-fe, pass)
- REQ-KG-CONF-06: Resolving a finding is choosing one canonical position; every non-canonical participant is then a target for a fix, a dissenting doc as a text edit and dissenting code via TDD plus the code-review gate, and only resolved findings produce a fix plan.
  Proven by: conflictCli.test.ts (unit-fe, pass) · conflictFixPlan.test.ts (unit-fe, pass)
- REQ-KG-CORE-01: A bare cross-reference resolves only when exactly one namespaced id shares its slug (auto-resolved); a slug matching two or more nodes is ambiguous-link and one matching zero is broken-link, and only node-target edges are link-validated (code-path edges like governs or exercises are never broken-link).
  Proven by: buildGraph.test.ts (unit-fe, pass)
- REQ-KG-CORE-02: Every path-bearing node id is namespaced repo:bare, with the repo decided solely by the project's declared topology — the longest declared subdir matching on a path boundary wins, and the repo declared at the workspace root is the fallback — and auto-generated requirement ids embed the namespaced feature id, so the same authored id in two repos can never collide.
  Proven by: config.test.ts (unit-fe, pass)
- REQ-KG-CORE-03: A unit test's feature membership is derived by glob-matching its path against registered feature paths — a file under no feature derives none; e2e tests are never glob-derived (they carry explicit features), and a features.yaml registry emits zero tag edges of its own.
  Proven by: deriveTags.test.ts (unit-fe, pass)
- REQ-KG-CORE-04: Each discovered source file is routed to exactly one parser by path pattern (else ignored), and only files matching the unit-test globs (including the tool's own src tests) are unit-test candidates — a non-test file in a matched directory is never indexed, keeping the graph bounded.
  Proven by: discover.test.ts (unit-fe, pass)
- REQ-KG-CORE-05: A requirement is proven only via an inbound covers edge or a provenBy slug resolving to a real test node (else uncovered-requirement); a doc is unverified-doc unless a test verifies it or every requirement it specifies is independently proven — the self-proven escape can never launder a doc with zero or any unproven requirement.
  Proven by: summarize.test.ts (unit-fe, pass)
- REQ-KG-CORE-06: Every proof a requirement cites must resolve to a real test node; one that resolves to nothing, or to a node that is not a test, is reported as broken-proof rather than silently discarded — and is reported per citation even when a sibling citation proves the requirement, because a dead path masked by a live one is how a stale claim survives a rename.
  Proven by: buildGraph.test.ts (unit-fe, pass)
- REQ-KG-CORE-07: A doc with status draft is a proposal, so neither it nor the requirements only it specifies are counted by the ratchet as unverified or uncovered — a proposal has claimed nothing and so cannot have failed to prove anything. A requirement any non-draft doc also specifies stays counted, and a draft nobody links to is still an orphan.
  ⚠ NO COVERING TEST
- REQ-KG-CTX-01: Given any file path in a project, the agent-context pack lists that path's governing docs, the requirements they specify, the tests covering those requirements, and any conflicts touching them — resolved from the project's own graph and config, knowing nothing about any particular project's layout. When nothing governs the path, the pack halts rather than warning.
  Proven by: agentContext.test.ts (unit-fe, pass) · freshInstall.test.ts (unit-fe, pass) · hookBriefing.test.ts (unit-fe, pass)
- REQ-KG-EVID-01: A raw.githubusercontent.com evidence URL is deterministically rewritten into a GitHub Contents API URL with each path segment and the ref URL-encoded (slashes preserved); an already-API URL passes through, and any non-raw or malformed URL returns null so the viewer falls through to the local or placeholder tiers instead of firing an authenticated fetch at a bad target.
  Proven by: evidenceUrl.test.ts (unit-fe, pass)
- REQ-KG-EVID-02: Contents-API base64 content is stripped of GitHub's 60-char line wraps and shaped into a data:image/png;base64 URL (empty or non-string content becomes null), consumed only as an img src and never injected as HTML.
  Proven by: evidenceUrl.test.ts (unit-fe, pass)
- REQ-KG-EVID-03: The evidence index keys each case's shots map by the original bare screenshot filename (the exact string a step's screenshot carries), confining the remote ordinal prefix to the URL path, so the viewer's exact evidence-by-filename lookup resolves.
  Proven by: applyEvidence.test.ts (unit-fe, pass)
- REQ-KG-EVID-04: Ingesting the evidence index attaches the shot-URL map only onto e2e-kind nodes matched by case-insensitive bare id, never a non-e2e node on a bare-id collision; a missing or malformed index leaves the graph unchanged (deterministic).
  Proven by: applyEvidence.test.ts (unit-fe, pass)
- REQ-KG-GATE-01: Every path that writes the graph also stamps `knowledge-graph.sources.json` with the exact sibling-repo commits it was built from, and warns — without blocking — on a pin CI could not fetch, so the inner loop stays usable while the lockfile never silently disagrees with the graph beside it.
  Proven by: sources.test.ts (unit-fe, pass)
- REQ-KG-GATE-02: `check --pinned` refuses to certify a graph unless the sibling checkouts sit exactly at the lockfile's commits, and a missing or malformed lockfile is refused rather than guessed at — so a `fresh ✓` verdict always means reproducible-from-pins, never merely that the graph happened to match one machine's checkout.
  Proven by: sources.test.ts (unit-fe, pass)
- REQ-KG-PIPE-01: Every entrypoint that writes the graph resolves the project it measures from the working directory, with KG_REPO_ROOT overriding it, and loads that project's config once rather than deriving any path from the tool's own location.
  ⚠ NO COVERING TEST
- REQ-KG-PIPE-02: sync reports the issue ratchet without ever blocking on it, naming each kind whose count moved and warning when any rose above baseline, so the inner loop stays usable while check remains the only gate that fails.
  ⚠ NO COVERING TEST
- REQ-KG-PIPE-03: sync warns when no test results have been recorded, and when the recorded results are older than a staleness threshold, because a graph whose test statuses came from a stale run reports proof it no longer has.
  ⚠ NO COVERING TEST
- REQ-KG-PIPE-04: sync reports what changed against the previously committed graph, and suppresses that report under --quiet.
  ⚠ NO COVERING TEST
- REQ-KG-RUN-01: A scoped run (--flow or --case) upserts only the cases it executed into kg-test-results.json, leaving untouched cases' status, attempts, and at intact; a full run replaces the map.
  Proven by: resultsFile.test.ts (unit-fe, pass)
- REQ-KG-RUN-02: Each result entry is stamped with the commit and timestamp of the run that produced it (per-entry), so a scoped re-record overwrites only its own entries' provenance and untouched or pre-schema entries keep — and never fabricate — their commit, at, and error.
  Proven by: resultsFile.test.ts (unit-fe, pass)
- REQ-KG-RUN-03: Only cases explicitly marked parallelSafe true join the concurrency pool (bounded by a clamped, at-least-1 integer); every other case is serialized, with input order preserved in both lists.
  Proven by: runSchedule.test.ts (unit-fe, pass)
- REQ-KG-RUN-04: A spawned Playwright run is terminated as a whole process tree (taskkill /T /F on Windows, SIGTERM on POSIX) so no orphaned worker or headed browser survives a cancelled or closed run.
  Proven by: treeKill.test.ts (unit-fe, pass)
- REQ-KG-RUN-05: A run only spawns after a frontend and backend readiness gate — proceeding when healthy or when nothing is wedged, waiting within the timeout window, and giving up with an honest serverNotReady past the timeout, never a silent hang or a fabricated result.
  Proven by: ensureOrchestrated.test.ts (unit-fe, pass)
- REQ-KG-SERVE-01: The /api/live SSE hub coalesces a burst of graph-rebuild notifications into exactly one debounced graph-updated broadcast, delivers it only to still-connected clients, keepalives idle ones, and evicts any client on socket close or a throwing write — one rebuild yields one re-fetch and no client leaks.
  Proven by: liveHub.test.ts (unit-fe, pass)
- REQ-KG-SERVE-02: Every read-only serve route (/registry, /src, /run-artifacts, /shots, /evidence) confines each read within its designated root — a directory for the four that read files, the configured bucket prefix for /evidence, which resolves object keys rather than paths — rejecting raw and URL-encoded traversal, backslashes, absolute or drive-letter paths, dotfiles, .local. credential files, and non-allowlisted extensions with a 404. A request the guard rejects is never signed.
  Proven by: blobStore.test.ts (unit-fe, pass) · pathGuard.test.ts (unit-fe, pass) · serveEvidence.test.ts (unit-fe, pass) · serveProvenance.test.ts (unit-fe, pass) · serveRunArtifact.test.ts (unit-fe, pass)
- REQ-KG-SERVE-03: /api/graph returns the current graph read fresh from disk on every request (a rewrite is served on the next fetch) and 404s a missing file.
  Proven by: serveGraph.test.ts (unit-fe, pass)
- REQ-KG-SERVE-04: Star curation writes back only the targeted feature entry — depth-anchored, idempotent, never matching a prefix or substring sibling or a nested star key, and throws on an unknown id.
  Proven by: toggleStar.test.ts (unit-fe, pass)
- REQ-KG-SERVE-05: The serve spawn-lock enforces single-owner server management — a lock held by a live process yields contended (no double-spawn), a stale, dead-owner, or corrupt lock is atomically reclaimed with the wx flag, and release only removes the caller's own lock.
  Proven by: serveLock.test.ts (unit-fe, pass)
- REQ-KG-SERVE-06: A run client disconnect is detected via the ServerResponse close event (not the request) and tree-kills the spawned run, guarded by an exited flag so normal completion never fires a kill.
  Proven by: serverDisconnect.test.ts (unit-fe, pass)
- REQ-KG-SUB-01: A repo the tool cannot read git history for contributes no dates and never fails the build — a missing git binary, a directory that is not a checkout, and a git invocation that errors are all tolerated per repo, so the graph builds on a machine with no git at all.
  ⚠ NO COVERING TEST
- REQ-KG-SUB-02: Dates are derived per owning repo, against that repo's own root and with the repo prefix stripped, because a workspace's nested repos are separate checkouts that share no history.
  ⚠ NO COVERING TEST
- REQ-KG-SUB-03: File paths are passed to git in bounded chunks rather than one invocation, so a large repo cannot exceed the platform's command-line length limit, and the chunks' output is concatenated before parsing because each chunk covers a disjoint path set.
  ⚠ NO COVERING TEST
- REQ-KG-SUB-04: A scoped test run passes its case filter through an environment variable rather than argv, and an unscoped run passes no filter at all, so a large scope cannot overflow the platform's command-line limit and silently produce no report.
  ⚠ NO COVERING TEST
- REQ-KG-SUB-05: Assets the tool ships are resolved relative to the tool's own package, and everything a project owns is resolved from its configured artifact directory — the two are never the same path, however the tool was installed.
  ⚠ NO COVERING TEST
- REQ-KG-SUB-06: A module decides it is the process entrypoint one way, in one shared helper — comparing its own URL to the file URL of the invoked script, and yielding false rather than throwing when no script was invoked. No entrypoint decision is made by string-concatenating a file URL or by matching a filename suffix, because both answer wrongly on a path that needs URL encoding.
  Proven by: isMain.test.ts (unit-fe, pass)
- REQ-KG-VIEW-01: The since-last-sync delta is injected only at the real __KG_DELTA__ template markers in the post-data tail — never at a marker string inside the inlined graph JSON — and a build passed no delta leaves the region null.
  Proven by: viewer.test.ts (unit-fe, pass)
- REQ-KG-VIEW-02: The delta reports, versus the previously committed graph, nodes added and removed grouped and sorted by type, test pass and fail transitions only for ids present in both graphs, and only the issue kinds whose count changed; the first sync yields no delta.
  Proven by: delta.test.ts (unit-fe, pass)
- REQ-KG-VIEW-03: digest/ is derived purely from the graph as exactly one markdown file per flow plus an index, each requirement shown as proven only when a covers-edge test or a provenBy slug resolves to a real test node, otherwise flagged as having no covering test.
  Proven by: digest.test.ts (unit-fe, pass)
- REQ-KG-VIEW-04: A flow's health lastVerified is the oldest runAt among its tagged e2e tests (worst-case honesty, not the newest), and a test tagged into features of more than one flow is counted once in the health totals.
  Proven by: summarize.test.ts (unit-fe, pass)
- REQ-KG-VIEW-05: Every untrusted string the viewer renders — a test's error output and an AI-authored suggested fix among them — is escaped as text and never injected as markup, so markup arriving from a test run or a model cannot become live DOM in the reader's browser.
  Proven by: A run result renders its error escaped, and its failure screenshot opens (e2e, todo) · A committed failure carrying a suggested fix renders it, escaped and labelled (e2e, todo) · A committed failure with no suggested fix renders no fix section at all (e2e, todo)
