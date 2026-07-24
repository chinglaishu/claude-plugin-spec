# Platform & docs — knowledge digest (synced 2026-07-24, results never)

Capabilities: 0 · with tests: 0 · promises: 39 (proven 39)

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
  Proven by: applyEvidence.test.ts (unit-fe, pass) · blobStore.test.ts (unit-fe, pass)
- REQ-KG-06: A system-design doc's markdown sections are classified deterministically (requirement / decision / open-question / knowledge) from content alone, so the viewer can navigate and tag them without any hand-authored per-section metadata.
  Proven by: parseDoc.test.ts (unit-fe, pass)
- REQ-KG-07: A doc is identified by its frontmatter `slug` when it declares one, falling back to `id` and then the filename — so a corpus that carries a catalog id (SD-nn) alongside a human slug stays cross-referenceable by the name its siblings actually cite.
  Proven by: parseDoc.test.ts (unit-fe, pass)
- REQ-KG-CONF-01: A conflict finding models one subject with at least two participants grouped into at least two positions (camps); a finding failing that cluster invariant is rejected, and the binary case is simply N=2 with no special-casing.
  Proven by: conflictModel.test.ts (unit-fe, pass)
- REQ-KG-CONF-02: The scan's comparison surface is enumerated deterministically from the graph's own edges (references for doc-doc, governs for doc-code, covers for requirement-test); two nodes with no connecting edge never become a candidate pair, so the AI adjudicates a bounded set and never free-hunts the tree.
  Proven by: conflictCandidates.test.ts (unit-fe, pass)
- REQ-KG-CONF-03: Contradiction adjudication runs out-of-platform (the kg-scan-conflicts skill); the viewer template and the serve process never call an AI SDK or invoke a model.
  Proven by: noAiInViewerServe.test.ts (unit-fe, pass)
- REQ-KG-CONF-04: graph.conflicts is a viewer-only payload deduped by content id and sorted, adding no nodes, edges, or issues (zero ratchet impact), so the same source findings always fold to byte-identical output.
  Proven by: parseConflicts.test.ts (unit-fe, pass)
- REQ-KG-CONF-05: A finding's identity is a stable hash of subject plus scope, so a re-scan of the same subject in the same scope yields the same id — the basis for dismissals and resolutions surviving a re-scan.
  Proven by: conflictId.test.ts (unit-fe, pass)
- REQ-KG-CONF-06: Resolving a finding is choosing one canonical position; every non-canonical participant is then a target for a fix, a dissenting doc as a text edit and dissenting code via TDD plus the code-review gate, and only resolved findings produce a fix plan.
  Proven by: conflictFixPlan.test.ts (unit-fe, pass)
- REQ-KG-CORE-01: A bare cross-reference resolves only when exactly one namespaced id shares its slug (auto-resolved); a slug matching two or more nodes is ambiguous-link and one matching zero is broken-link, and only node-target edges are link-validated (code-path edges like governs or exercises are never broken-link).
  Proven by: buildGraph.test.ts (unit-fe, pass)
- REQ-KG-CORE-02: Every path-bearing node id is namespaced repo:bare with repo classified purely by path prefix (dojostack_backend to backend, dojostack_frontend to frontend, else main), and auto-generated requirement ids embed the namespaced feature id, so the same authored id in two repos can never collide.
  Proven by: config.test.ts (unit-fe, pass)
- REQ-KG-CORE-03: A unit test's feature membership is derived by glob-matching its path against registered feature paths — a file under no feature derives none; e2e tests are never glob-derived (they carry explicit features), and a features.yaml registry emits zero tag edges of its own.
  Proven by: deriveTags.test.ts (unit-fe, pass)
- REQ-KG-CORE-04: Each discovered source file is routed to exactly one parser by path pattern (else ignored), and only files matching the unit-test globs (including the tool's own src tests) are unit-test candidates — a non-test file in a matched directory is never indexed, keeping the graph bounded.
  Proven by: discover.test.ts (unit-fe, pass)
- REQ-KG-CORE-05: A requirement is proven only via an inbound covers edge or a provenBy slug resolving to a real test node (else uncovered-requirement); a doc is unverified-doc unless a test verifies it or every requirement it specifies is independently proven — the self-proven escape can never launder a doc with zero or any unproven requirement.
  Proven by: summarize.test.ts (unit-fe, pass)
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
- REQ-KG-SERVE-02: Every read-only serve route (/registry, /src, /run-artifacts, /shots) confines each read within its designated root, rejecting raw and URL-encoded traversal, backslashes, absolute or drive-letter paths, dotfiles, .local. credential files, and non-allowlisted extensions with a 404.
  Proven by: pathGuard.test.ts (unit-fe, pass)
- REQ-KG-SERVE-03: /api/graph returns the current graph read fresh from disk on every request (a rewrite is served on the next fetch) and 404s a missing file.
  Proven by: serveGraph.test.ts (unit-fe, pass)
- REQ-KG-SERVE-04: Star curation writes back only the targeted feature entry — depth-anchored, idempotent, never matching a prefix or substring sibling or a nested star key, and throws on an unknown id.
  Proven by: toggleStar.test.ts (unit-fe, pass)
- REQ-KG-SERVE-05: The serve spawn-lock enforces single-owner server management — a lock held by a live process yields contended (no double-spawn), a stale, dead-owner, or corrupt lock is atomically reclaimed with the wx flag, and release only removes the caller's own lock.
  Proven by: serveLock.test.ts (unit-fe, pass)
- REQ-KG-SERVE-06: A run client disconnect is detected via the ServerResponse close event (not the request) and tree-kills the spawned run, guarded by an exited flag so normal completion never fires a kill.
  Proven by: serverDisconnect.test.ts (unit-fe, pass)
- REQ-KG-VIEW-01: The since-last-sync delta is injected only at the real __KG_DELTA__ template markers in the post-data tail — never at a marker string inside the inlined graph JSON — and a build passed no delta leaves the region null.
  Proven by: viewer.test.ts (unit-fe, pass)
- REQ-KG-VIEW-02: The delta reports, versus the previously committed graph, nodes added and removed grouped and sorted by type, test pass and fail transitions only for ids present in both graphs, and only the issue kinds whose count changed; the first sync yields no delta.
  Proven by: delta.test.ts (unit-fe, pass)
- REQ-KG-VIEW-03: digest/ is derived purely from the graph as exactly one markdown file per flow plus an index, each requirement shown as proven only when a covers-edge test or a provenBy slug resolves to a real test node, otherwise flagged as having no covering test.
  Proven by: digest.test.ts (unit-fe, pass)
- REQ-KG-VIEW-04: A flow's health lastVerified is the oldest runAt among its tagged e2e tests (worst-case honesty, not the newest), and a test tagged into features of more than one flow is counted once in the health totals.
  Proven by: summarize.test.ts (unit-fe, pass)
