# claude-plugin-spec — Founding Design

- **Date:** 2026-07-17 (rewritten same day — see §10)
- **Status:** Founding design note. The project's first artifact and its north star.
- **Prior art:** `dojostack_main/tools/knowledge-graph/` (the in-tree original, ~55 modules / 438 tests)
  and its PRD `.github/system-design/KNOWLEDGE_GRAPH_TOOL.md`; the design notes
  `2026-07-14-greenfield-spec-first-mode-design.md`, `2026-07-16-kg-gate-pinned-sources-design.md`,
  `2026-07-17-kg-config-extraction-design.md`; `mockups/DIRECTION.md` (the landscape scan).

---

## 1. What this is — two jobs, and only two

1. **One truth.** The source of truth must not contradict itself — because when it does, the AI picks a
   side **silently**, and different sessions pick differently. That is what "the feature randomly
   changed" actually is.
2. **Every behaviour proven.** Each expected behaviour has a Playwright test. All green = safe to
   iterate.

That is the entire product. Everything below serves those two sentences or it does not ship.

**Neither artifact is an entry requirement — the tool builds both.** *(Corrected 2026-07-17, CEO: the
original framing read as if an existing SSoT and an existing Playwright suite were preconditions, which
inverted the adoption story.)* The user arrives with a codebase and an AI agent, nothing else. The SSoT
accretes through the tool's own motions: the conflict scan needs no docs to find code-vs-code
contradictions (`irrCalculator.ts` vs `financial.py` is exactly that); each adjudication becomes a
canonical position; stop-and-ask (§9b.2) forces a requirement into existence for every new behaviour;
a flow approval (§6) ratifies watched behaviour into a requirement. And the Playwright tests are
written by staff through the skills (`kg-e2e`, `add-test`) — created for the user, never demanded of
them.

## 2. Scope — where this helps, stated honestly

A normal build, web or mobile, runs roughly:

| | phase | who owns it |
|---|---|---|
| 1 | Idea → PRD (AI refines and judges the idea) | **Claude conversation. Not this tool.** |
| 2 | Wireframe → design → user flow (Figma, Claude) | **Not this tool.** |
| 3 | **AI coding development** | **this tool** |
| 4 | **Launch + iteration** | **this tool** |

**We do not pretend to help with the whole lifecycle.** Phases 1–2 are crowded and well served. The pain
this exists for is (3) and (4): *it is painful to repeatedly debug with AI.* Concretely —

- the SSoT contradicts itself → the AI resolves it silently, differently each session;
- expected behaviour is not precise enough → the AI guesses → bugs;
- nothing proves the behaviour → every iteration risks a regression nobody notices.

The tool starts when a behaviour is **decided**, and its whole job is keeping that behaviour **true**
while people and AI keep changing the code around it. "Decided" describes each behaviour's lifecycle,
not the user's starting state *(clarified 2026-07-17, CEO)*: a behaviour can be decided and live only
in code, undocumented — then the tool's job starts by writing it down (§1). What stays out of scope is
deciding *what to build*; that is phases 1–2, owned elsewhere.

## 3. The seam nobody else is in

By 2026 every major tool ships spec-driven development — GitHub Spec Kit, AWS Kiro, Claude Code, Cursor
— and they all implement the same beats: **Specify → Plan → Implement → Validate**. That is phases 1–2:
a one-way flow, idea → spec → code.

Kiro comes closest to us with "requirements analysis", and its own framing shows the gap: it validates
**one spec document**, at **spec-authoring time**, **before** implementation, with no CI and no
requirement→test linkage. It ensures the spec is sound before code exists. It has nothing to say six
months later when the backend flips to post-tax and `irrCalculator.ts` still claims parity.

> **Everyone validates the spec BEFORE implementation. Nobody keeps it true AFTER.**

That is the seam. **Do not compete on SDD.** Compete on: *your spec is already written and already lying
to you — here is the tool that keeps it honest while you iterate.*

**And the entry point does not require a spec at all** *(clarified 2026-07-17, CEO)*: every SDD tool
needs you to start from a spec; this one can also start from code — scan the codebase (or one domain),
surface its contradictions, and build the SSoT out of the adjudications. "Already written and lying"
and "never written down" are the same seam: nobody else keeps truth after implementation, whichever
state you arrive in.

## 4. CEO ↔ staff — the north star everything derives from

> Human = **CEO**: writes the requirement SSoT, answers only the decisions staff can't make, reviews at
> milestones. AI = **staff**: works to the doc. Implied product shape: **staff tooling** (context for
> agents + a drift gate) + **CEO cockpit** (SSoT · a decision inbox for conflicts/open-questions · review).

The sharp consequence: **the CEO's only gate is approving requirement text.** They state intent and
approve words — and, for UI behaviour, approve a *flow* (§6). They never watch the process.

**They do read — just not routinely.** *(Corrected 2026-07-17: this first said "they never read a long
spec", which is false and was load-bearing — it was used to rank fullscreen as a staff-only surface.)*
Reading is **for judging**, not a standing obligation: pulling context before adjudicating a conflict,
checking what a requirement actually says before approving a change to it. So the CEO needs a surface to
read *on demand* — which is what fullscreen is for. What they must never need is to read the spec
**to stay current**. That is the tool's job.

## 5. The three deliverables — and the missing one is the gold

| # | deliverable | status |
|---|---|---|
| 1 | **The platform** — graph, conflict scan, requirement→test linkage, the gate | mostly built |
| 2 | **The skills** — `kg-spec`, `kg-e2e`, `kg-scan-conflicts`, `kg-fix-conflicts`, `add-test` | built **in DojoStack — not yet ported**: this repo's `skills/` is empty *(corrected 2026-07-17 — "built" read as done for this product, which it is not)* |
| 3 | **The staff prompt** — how the AI must behave | **does not exist** |

**(3) is the gold and it is the cheapest.** The platform can detect every contradiction in a repo and
change *nothing* if staff never looks before coding. A perfect graph nobody consults is an expensive
lint. The staff prompt is what makes (1) and (2) pay off — it is the difference between "the tool knows"
and "the tool is used". Its search-first mechanism already has a prototype (`agent-context.mjs`: given a
file, print its governing spec + requirements + covering tests + conflicts).

**Consultation has two paths, and the prompt is only the ambient one** *(clarified 2026-07-17, CEO)*:
deliberate — the user or staff invokes the scan skill over the whole codebase or a single domain
*before* development starts, so "no conflicts before we build" is an explicit motion, not a hope; and
ambient — the hook routes every coding task through governing context. The metrics below measure the
ambient path; the deliberate path is a skill invocation, which either ran or did not.

**What "working" means, measurably** *(added 2026-07-17: the gate has metrics — ratchet counts,
fingerprints — while the gold had none, and "the hook is installed" must not be allowed to pass for
"the prompt works")*: (a) coding sessions consult governing context **before the first edit** —
observable in session transcripts, not assumed; (b) the `ungoverned-code` ratchet count trends down
rather than merely holding. Available ≠ used is this section's own point; these two numbers are what
make the difference checkable.

## 6. Two languages for requirements

**Text, for what cannot be watched** — invariants, formulas, orderings, definitions. This is not a
fallback; it is where the real conflicts live. Every genuine contradiction found so far is of this kind:
`irrCalculator.ts` vs `financial.py` (a tax basis), the House-View status enum, the npi_margin
denominator, overlay composition order, occupancy weighting. **No browser can click any of those.**

**Flow, for user-facing behaviour** — the CEO ratifies by *watching* a Playwright run, not reading.
This resolves the standing contradiction: nobody reads long text (true), yet someone must confirm each
part behaves as intended (also true, or the part shouldn't exist). So: **confirm by watching, and only
when it changes.**

Two things make this work, and both are easy to get wrong:

- **Authority runs CEO → flow → code, not code → doc.** Playwright traces as "living documentation" is a
  known 2026 idea, and as documentation it is worthless as a check: *a trace of passing code always looks
  correct*, whether the code is right or wrong. It becomes a **requirement** only at the instant a human
  says "yes, that is what I wanted".
- **The artifact is the approval plus the diff, not the trace.** The value is: *"this flow changed since
  you approved it — before → after — intended?"* Five seconds, no reading, and an unintended behaviour
  change **is** the bug. That is the decision inbox for phase (4).

**The approval must be a click, not a clipboard — and as of 2026 it can be.** Three documents inherited
from the original tool assert the opposite, and all three are now **obsolete**:

| source | claim | status |
|---|---|---|
| PRD §8 | "a browser page cannot drive the terminal, so it never applies code edits itself" | **false** |
| greenfield note §3 | "❌ No write-back dispatch bridge. The cockpit emits a `/kg` command" | **false** |
| DIRECTION.md | "How does a human action in the UI trigger a Claude action (dispatch bridge)? — undecided" | **answered** |

[**MCP Apps**](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) (2026-01-26, the first
official MCP extension, "ready for production"): a tool declares a UI resource, the host renders it in a
sandboxed iframe, and the UI calls `app.callServerTool()` to invoke a tool directly plus
`app.updateModelContext()` to tell the model what the user chose. The clipboard handoff was a workaround
for a platform limitation that no longer exists — dated design, not a decision.

**This is what makes flow-approval buildable at all.** "Approve" becomes a real, recorded tool call that
*ratifies a requirement*, not a copied string a human re-types. Without it, §6 is a nice idea with no
mechanism.

### 6a. Where it renders — verified 2026-07-17

**The Claude Code CLI does not render MCP Apps.** Its MCP documentation mentions tools, resources,
prompts, elicitation, output limits and approval — and **zero** occurrences of `ui://`, "MCP Apps",
"display mode", "fullscreen", "iframe", "callServerTool" or "interactive UI". The spec's adopters are
Postman, HuggingFace, Shopify, Goose and ElevenLabs; the announcement's hosts are Claude web + desktop,
Goose, VS Code Insiders and ChatGPT. Claude Code appears in neither list. **There is no working Claude
Code example to copy.**

**This is not a blocker — it is the CEO ↔ staff split expressing itself in surfaces:**

| | surface | needs UI? |
|---|---|---|
| **CEO** | Claude desktop / web | **yes** — and it renders. Proven 2026-07-17: an interactive widget with a working dispatch button, in this very project's conversation. |
| **staff** | Claude Code CLI | **no.** Staff needs the prompt and the gate. Both are text. |

Design for that split rather than against it. The cockpit targets where the CEO already is; the CLI gets
no cockpit and does not want one.

**Three display modes**, and the mechanics are a negotiation, not a command: a view declares
`appCapabilities.availableDisplayModes` during `ui/initialize`, requests changes via
`ui/request-display-mode`, and the **host returns the mode actually set** — which may differ — notifying
via `ui/notifications/host-context-changed`. A host MUST NOT switch a view to a mode it never declared.
So **design for inline and treat fullscreen as an upgrade the host may decline.**

- **inline** — the decision inbox. *"This flow changed — approve?"* The CEO surface, and the one that matters.
- **fullscreen** — the knowledge map, coverage tables, and **the batch review bench** (§6b). Serves both: staff browsing, and the CEO reading *on demand* to judge (§4). `serve.ts` already provides it in a browser, which is why it is the least *urgent* mode — not the least important. An earlier draft ranked it staff-only on the strength of "the CEO never reads", which was wrong.
- **pip** — a persistent gate light. **This is the anti-`|| echo`**: the gate was broken for months because the signal was a CI log nobody reads, and 32 requirements vanished behind a `console.warn` that scrolled past. PiP is not a new detector — the data already exists — it is the difference between a truth that is *available* and one that is *unavoidable*. It attacks the real failure mode: not "we couldn't detect it" but "nobody looked."

**External URLs are deferred from the MVP** (model visibility, un-screenshottable content, review process),
so an app **cannot iframe `localhost`** — it is a self-contained bundle the host reviews. That forces an
architecture change which is a **win regardless**: today `viewer.html` is **13 MB**, the whole graph
inlined, regenerated and committed on every build. As an app it inverts to a lean shell that calls
`app.callServerTool('graph')` for its data — **and the 13 MB commit-on-every-build disappears.** The
current design only exists because a static file had no way to ask a server for anything. It does now.
A button can still `window.open()` an external URL after scheme validation, so `serve.ts` survives as the
deep-dive surface.

### 6b. The review bench — batch, not one-at-a-time

The inline inbox (§6a) is for *one* decision arriving while you work. It is the wrong shape for the
CEO's real motion: **sit down, go through everything, leave comments, dispatch one fix job.** That is the
GitHub PR-review model — pending comments, then submit once — and it is how humans actually review.
Adjudicating conflicts one at a time in a chat is not review; it is interruption.

**Nearly all of this is already built, and was never reachable.** Measured 2026-07-17:

| step | mechanism | status |
|---|---|---|
| review all | the viewer's Conflicts tab | **built** |
| leave a comment | `Decision.note?: string` | **built** — the field exists |
| store it | `conflicts/decisions.json`, via `/api/conflict-decisions` | **built**, keyed by hash(subject+scope) so a decision survives a re-scan (REQ-KG-CONF-05) |
| fix all at once | `fixPlanFor(finding, canonicalPositionId, note?)` → `/kg-fix-conflicts <scope>` | **built** — the fix plan already consumes the note |
| **type the comment** | a `<textarea>` in the Conflicts tab | **missing** |

**The `note` is plumbed end-to-end — store → fix plan → skill — and there is no box to type it into.**
The feature is one input away, not a subsystem. Decisions are deliberately a *runtime overlay* outside
the deterministic graph, so triage never makes `check` byte-dishonest — that design is right and stays.

Two things this reframes:
- **Fullscreen is where this lives** (§6a), which is the CEO reading-to-judge that §4 now admits to.
- **The batch bench and the inline inbox are different products for different moments**, not two designs
  competing. Inline = "this changed while you were working, approve?". Bench = "you have twenty minutes,
  clear the queue."

## 7. Requirement zero

> **REQ-0** — *Given any repo root supplied as configuration, the tool builds a byte-identical graph to
> the one DojoStack's in-tree copy produces — knowing nothing about DojoStack.*

Simultaneously the port's acceptance criterion, the proof genericization worked, and the first honest
test that "reusable" is real rather than aspirational. ~~It fails today — the topology is hardcoded in
twelve files — and goes green exactly when config lands.~~

**GREEN as of 2026-07-17**, when phase 2 landed config and the last `dojostack` string left `src/`. The
fingerprint against `dojostack_main` was byte-identical at every step
(`0d66f86c…`, 1395 nodes / 1968 edges / 831 issues), which is the other half of the claim: the graph did
not move, so nothing about the *measurement* changed — only who supplies the topology.

**This retires the question in §12.1 by asking it.** REQ-0's byte-identical half needs a private repo,
so it can never run in this repo's CI or survive distribution; only the grep half can. That was always
known — the point is that "resolve it before REQ-0 goes green" is now overdue, not upcoming.

**RETIRED 2026-07-17 (CEO): REQ-0 completed its job as the migration acceptance criterion and is
succeeded by:**

> **REQ-1** — *The committed fixture projects — one-repo and multi-repo — build to their committed
> expected graphs, byte-identical, on any machine, with no access to any private codebase.*

REQ-1 is the standing, CI-runnable proof that "generic" is real (§8's single-repo argument, made
permanent), and it tests the assumption rather than the spelling — closing §12.9's gap: a tool that
hardcodes a runner or a layout will build the wrong fixture graph, whether or not it ever says
"dojostack". REQ-0's grep half survives as a lint; its byte-identical half lives on only as the manual
oracle against `dojostack_main` until phase 5 rewires it.

**REQ-1 is GREEN as of 2026-07-17**, the day it was approved — written test-first
(`src/fixtureRepo.test.ts`: five tests, all watched red before the fixtures existed). The fixtures
live at `fixtures/one-repo` and `fixtures/multi-repo`; their expected graphs are captured normalized,
with a pinned clock and an inert `GitRunner`, so they reproduce on a machine with no git and no
history. `scripts/fixture-expected.mts` regenerates them — a committed claim to re-review on any
deliberate change, never a cache to refresh blindly.

## 8. The oracle, and why a ~55-module port is not an act of faith

The graph is a **pure function of the tree**. Proven 2026-07-17: `buildGraph()` at a pinned timestamp,
normalized exactly as `check.ts`'s `normalizeForCompare` does, SHA256'd — **byte-identical across
darwin-arm64, linux-arm64 and linux-x64**.

Every entrypoint honours `KG_REPO_ROOT`, so **the oracle survives the move**: this repo's ported tool,
pointed at `dojostack_main`, must reproduce the same hash. **The contract is the method, not a literal
hash** — the fingerprint moves whenever DojoStack's tree changes, so each phase captures it fresh from an
unmodified tree, changes only tool code, and asserts it unchanged.

The port and the genericization are guarded **separately**: port as-is → hash must match immediately
(proving only that the *move* was clean, which is all it needs to prove); then genericize → REQ-0 goes
green **and** the hash still matches.

**Self-hosting is the single-repo proof.** `claude-plugin-spec` is a one-repo project; DojoStack is the three-repo
case. The tool cannot govern itself while it still believes the world contains `dojostack_backend/`. The
dogfood is the test, not a gesture.

## 9. The rules

DojoStack's ceremony does **not** apply here: no Stop hooks, no mandatory review agent, no `soc-gate`.
These are chosen, and short on purpose — *nobody reads long text* applies to operating manuals too.

### 9a. CEO page — how to lead staff well

1. **Write behaviour, not implementation.** "Flag a covenant breach when projected DSCR falls below the
   loan minimum" — not "add a validator".
2. **Be precise enough to fail.** If no test could ever fail it, it isn't a requirement, it's a mood.
3. **Adjudicate conflicts.** Only you can say which side is true. This is the job nobody else can do.
4. **Approve flows, don't read specs.** For UI behaviour: watch it, judge it, and only when it changes.
5. **Review at milestones, not steps.** Not your job: reading the spec, watching the process, approving
   each move.

### 9b. Staff page — how to execute well, and when to stop

1. **Before touching code, find what governs it** — spec, requirements, covering tests, known conflicts.
2. **Nothing governs it → STOP. Ask the CEO for a requirement.** Never write ungoverned code: the next
   person to change it has no guideline for how it should work, and that is where the bug is born.
3. **Two sources disagree → STOP. Ask the CEO which is canon. Never pick a side.**
4. **Write the failing test first** (for new or changed behaviour) — see §10.2.
5. **Never weaken, skip, or delete a test to go green.**
6. **Tidy docs freely** — structure, typos, dead links, examples, stale counts.
7. **Requirement *semantics* need CEO approval**: a new REQ, changed REQ text, a deleted REQ, or choosing
   a canonical side. **Staff edits prose; the CEO owns meaning.**
8. **Don't ask permission to work.** Escalate only for 2, 3 and 7.

### 9c. Defence in depth

**L1** the staff prompt (does the right thing, mostly) · **L2** the CEO (adjudicates what staff
escalates) · **L3** the gate (catches when L1 didn't). A prompt alone is the honour system — which
already failed at 70 requirements. A gate alone is a nag nobody reads. **The gate blocks; report-only is
decoration.**

## 10. Decisions locked

1. **Scope is (3)+(4).** Not the whole lifecycle. Consequences: **design drift is dropped** (it is not
   the pain), and the six-tab cockpit is not the product — the CEO surface is a **decision inbox**.
2. **Test-first for new or changed behaviour.** Not ceremony — the thesis. *Evidence, from this project's
   own repo:* REQ-KG-04's `covers:` pointed at a test proving `ratchetFailures()` **returns** failures
   while nothing proved the pipeline **acts** — green for months, requirement false. `parseDoc.test.ts`'s
   fixture encoded the code's own assumption (`id: house-view-freeze`), so it stayed green while the graph
   silently dropped 7 docs. **A test written after the code can only confirm the code, never contradict
   it** — and a `covers:` edge from a code-derived test is a false claim, which is precisely what this
   tool exists to detect. **Exempt:** the 438 ported tests (history can't be re-TDD'd), pure refactors
   (the fingerprint is the test), and spikes.
3. **Greenfield is an issue kind, not a tab.** "No code without a requirement doc" is enforced as an
   `ungoverned-code` issue in the **existing ratchet** — frozen baseline, count may fall but never rise.
   Existing untouched code stays legal; new ungoverned code fails the build. No new UI.
   **Unblocked 2026-07-17: the CEO committed to adopting `governs:`.** That was the load-bearing
   question — detection is cheap to build and worthless if docs never declare governance (nine of 272
   did). With the habit committed to, this becomes real work rather than a smoke detector in a house with
   no alarms wired in. The mechanism already exists (`governs:` edges map docs → code paths); what is
   needed is the diff-time check and the baseline. **A rule alone would be the honour system — which is
   exactly what failed at 70 requirements — so it is a gate, not a staff instruction.**
4. **The staff prompt is a first-class deliverable**, shipped as a skill plus a `UserPromptSubmit` hook
   that routes coding tasks through it.
5. **One repo, three consumers** — npm package (CI runs the gate, where Claude Code does not exist),
   Claude plugin (the skills + hook), self-hosted (its own graph).
6. **Move first, then genericize** — `KG_REPO_ROOT` means the oracle survives the move.
7. **DojoStack is rewired last**, so nothing breaks meanwhile.
8. **Config is threaded explicitly, never a module-level singleton.** Entrypoints call
   `loadConfig(repoRoot)` once and pass it down; `repoOf(path, repos)` / `nsId(path, bare, repos)` take
   the topology. A singleton would be near-zero churn but makes the tool stateful, forces test
   setup/teardown, and a parser imported standalone would silently emit wrong ids — a permanent hazard
   traded for a one-time mechanical cost. It also matches the codebase's own instinct: `gitDates.ts`
   injects a `GitRunner` rather than reaching for global git, which is exactly why its logic is testable
   without a real repo. **Rejected outright:** a project-supplied `kg.config.ts` the tool imports — an
   inverted dependency that would make extraction impossible, which is the whole point.

   **The cost is bounded and mechanical, not structural:** `nsId` has 8 call sites and `repoOf` 2. The
   six parsers already take a *path* and never mention repos — they do not know the topology exists.

9. **The topology gets one owner.** It is currently re-declared in four places — `repo.ts` (as a union
   **type**, so it is in the type system, not just strings), `gitDates.ts`, `serve.ts`, and `sources.ts`,
   which the gate work added on 2026-07-16 as the third independent copy. **The pattern is still actively
   reproducing.** Shipping config while leaving three shadow copies would be a symptom fix — the config
   would be true and the code would still believe something else. Collapsing all four is the defect, not
   scope creep.

   **Two classes of coupling, and only the move revealed the second:** twelve non-test files hardcode
   `dojostack_*` *paths*, but `serve.ts` also reads the graph from `join(__dirname, "..")` — **the tool
   assumes it lives inside the project it measures.** That is the more fundamental assumption for a
   package, and no amount of reading found it; porting did, as 3 failing serve tests.

   **DONE 2026-07-17, and the second class was worse than 3 serve tests suggested.** Collapsing the four
   copies was exactly as mechanical as §10.8 predicted. But "the tool assumes it lives in-tree" had four
   more instances that no failing test named, because they had **silently stopped running**:
   - `recordRun`/`syncResults`/`serve` spawn the tool's own scripts (`src/sync.ts`, `src/build.ts`) with
     the *artifact dir* as cwd — which contains a `src/` only in-tree.
   - `gitDates.test.ts`'s real-git regression guard walked up three levels to a workspace, landed
     outside any repo after the port, and `skipIf`'d itself away.
   - `viewerRevamp.test.ts` borrowed **jsdom from a sibling package's node_modules** ("adds no new
     devDependency to the tool" — true only while the tool was not a package), and self-skipped: 13
     tests.
   - `serveProvenance.test.ts` read the real checkout. Its negative cases then passed for the *wrong
     reason*: "404s a non-allowlisted extension **even when the file exists**" asserted a 404 on a file
     that no longer existed, so it proved nothing.

   The pattern is one thing, not four: **a coupling to the environment degrades into a skipped or
   vacuous test, not a red one.** The port converted `join(__dirname, "..")` from correct to broken, and
   the suite reported that as *fewer tests*, which reads as green. Both are now fixed and hermetic; the
   suite runs 475 tests with **nothing skipped**. `TOOL_DIR` (`src/toolDir.ts`) names the split the whole
   class came from: assets the tool ships vs. artifacts the project owns.

10. **Everything stays local — in the user's own repo and git. No cloud service in the core.**
   Comments live in `conflicts/decisions.json`; test results in `kg-test-results.json`; screenshots
   **on the local device by default, or at a project-supplied blob URL**, addressed by URL and never
   on the working branch or inside the graph JSON (REQ-KG-05). Three reasons, in order of weight:

   > **Amended 2026-07-24 (CEO): the `e2e-evidence` branch is no longer the mandated destination.**
   > Committing PNGs to a side branch is an unusual mechanism that surprises people and baked one
   > vendor's hosting into a requirement. This does **not** weaken the decision — a *user-supplied*
   > bucket is not a cloud service in the core, and reason 2 below gets **stronger**, not weaker:
   > nothing ships to us under either mode. Reason 1 is untouched, because screenshots were never the
   > SSoT — the graph carries references, and now provably so (see the amendment to the YAGNI note
   > below).

   - **A cloud SSoT would contradict the central claim.** The thesis is that the graph is a *pure
     function of the tree* — that is why the fingerprint works, why `check` can gate, and why REQ-KG-01
     means anything. The moment truth lives in a database nobody rebuilds from source, it can drift, and
     we would have shipped a drift-detection tool with an undetectable drift surface at its centre. Same
     category of error as `|| echo`.
   - **Privacy is the adoption gate, not a nicety.** Screenshots of a CRE platform contain rent rolls,
     tenant names, deal terms. "Install a plugin, nothing leaves your repo" survives a security review;
     "ship your screenshots to our S3" does not. **Git-native is the reason a security-conscious
     enterprise can adopt this at all** — a feature, not a limitation we settled for.
   - **There are zero users.** Building storage infrastructure before anyone uses the thing is the
     classic mistake. The repo works today.

   ~~**Do not build a storage abstraction** (YAGNI — there is no second implementation to abstract
   over)~~, but **do not couple to git either**, so a cloud adapter stays possible. `shotsUpload.ts`
   already gets this right by injecting `FsLike`/`GhLike`.

   > **Amended 2026-07-24:** the YAGNI clause is spent, and by its own terms. It said not to abstract
   > because there was no second implementation; the CEO's blob-URL decision **creates** the second
   > one (local device, project blob URL), so the condition that justified the ban no longer holds.
   > The "do not couple to git" half is what made this cheap — the injected `FsLike`/`GhLike` seam was
   > left for exactly this, and it is the reason this is a swap rather than a rewrite.
   >
   > It also exposed a real hole: REQ-KG-05 asserted binaries never enter the graph, and **nothing
   > enforced it** — `applyEvidence` passed any value through, including an inline `data:` image.
   > That is now enforced and proven (`referencesOnly`), which is what finally closes the one
   > requirement the 2026-07-24 backfill honestly left uncovered.

11. **Video is not in the core; it is a monetization candidate.** Playwright videos run ~1–5 MB each —
   gigabytes across a suite, and git would break. But **flow-approval (§6) does not need video and is
   worse with it**: `pacedStep` + `.step-shots` already produce a step-by-step screenshot storyboard, and
   **two screenshots diff — two videos do not.** The diff *is* the product ("before → after — intended?"),
   so step-shots are the mechanism, not a compromise. Video may earn its place in a paid tier (sharing a
   run with a stakeholder), which is a **business question, deferred with the cloud** — see §10.12.

12. **The cloud is a monetization question, not an architecture one.** If a team ever wants shared review
    threads, comment history across people, or cross-project dashboards, that is a product *on top* of
    the git-native core — not a replacement for it. Deciding it now, with no users, would be answering a
    question nobody has asked yet. Revisit when a paying customer asks; the answer is worthless before
    then.

**Rewritten 2026-07-17**, hours after the first draft, because the scope narrowed to (3)+(4), the staff
prompt was identified as the gold, design drift was cut, greenfield was reframed from a tab to an issue
kind, and flows were recognised as the CEO's language for UI. Recorded rather than silently replaced —
per the rule that docs get corrected in place, with the reason attached.

**Numbering corrected 2026-07-17:** the last two decisions were mis-numbered 9 and 10 — duplicating
earlier items and making references like "§10.10" ambiguous, in a document whose whole thesis is that
the SSoT must not contradict itself. They are now 11 and 12. The `src/` comments citing §10.8/§10.9
(config threading, topology owner) referred to the correctly-numbered items and keep their meaning.

## 11. Phases

| # | What | Done when |
|---|---|---|
| **1** | Port `src`/tests/PRD/viewer; npm deps | ✅ fingerprint vs `dojostack_main` matches |
| **2** | Genericize onto `kg.config.json` (topology → paths → runners) | ✅ **done 2026-07-17** — REQ-0 green, fingerprint unchanged (`0d66f86c…`) |
| **3** | Self-host: own config, own graph, own gate | its `REQ-KG-*` live in its own graph (= the single-repo proof, §8) |
| **4** | The **staff prompt** — skill + `UserPromptSubmit` hook; plugin manifest + marketplace | installable; staff consults the SSoT before it writes a line, *measured* per §5; **renamed off the placeholder first (§12.4)** |
| **5** | Rewire DojoStack: delete `tools/knowledge-graph/`, consume the npm dep | DojoStack's graph is purely DojoStack |

DojoStack keeps its **artifacts** (graph, viewer, baseline, lockfile), its **config** and its **workflow**
— those are its data, not the tool. `tools/knowledge-graph/` keeps working untouched until phase 5, so
nothing breaks while this is built.

**Phase 4 is where the value lands** (§5): the platform is inert until staff is made to consult it. If
time runs out, ship 1–4 and leave DojoStack on its in-tree copy — the tool still works for the next
project. Phase 5 is hygiene, not value.

**Amended 2026-07-17 (CEO-approved): 3 and 4 run as one loop, not a sequence.** Self-hosting without
the staff prompt is a graph nobody consults — §5's own critique, applied to this plan — and the prompt
without a graph has nothing to consult. So the `agent-context.mjs` prototype gets wired as a hook in
this repo at the *start* of phase 3, and every session spent building the tool doubles as the test of
whether the gold actually changes staff behaviour (§5's measure). The project's highest-risk assumption
— that a prompt plus a hook makes staff look before coding — was scheduled last of the value-bearing
phases; it is precisely the one to test first.

## 12. Open questions

1. **REQ-0's test depends on a private repo — what replaces it after the port?** REQ-0 is defined as
   "byte-identical to DojoStack's copy", which is exactly right as a *migration* acceptance criterion and
   unshippable as a permanent one: the test needs a private CRE codebase, so it cannot run in this repo's
   CI and cannot survive public distribution (§12.5). A generic tool whose requirement-zero cannot be
   verified by anyone who installs it is not generic. Likely answer: REQ-0 is a **migration requirement**
   that retires once green, and its permanent successor is a **committed fixture repo** (a tiny synthetic
   project, one-repo and multi-repo variants) whose graph is asserted — which is also the cheapest honest
   proof that "reusable" is real (§8). Resolve during phase 2, before REQ-0 goes green and the question
   stops being asked.
   **RESOLVED 2026-07-17 (CEO): yes, as the likely answer predicted.** REQ-0 retires as a completed
   migration requirement; its permanent successor is **REQ-1 (§7)** — the committed fixture repos,
   asserted byte-identical in CI, which also answers §12.9 by testing the assumption instead of the
   spelling.
2. ~~**Will `governs:` be adopted?**~~ — **RESOLVED 2026-07-17: yes.** See decision 10.3. Nine docs of 272
   declared it at the time of asking; the CEO committed to the habit, which is what makes the
   `ungoverned-code` ratchet worth building. Open follow-up: backfilling `governs:` across the existing
   corpus is its own slice, and the ratchet must not block on it — freeze the baseline where it lands.
3. **Build flow-approval (§6)?** The most differentiated idea here and entirely undesigned. Overlaps
   Percy/Chromatic on approve-the-diff; the novelty is that approval **ratifies a requirement** rather
   than blessing a screenshot. *Deferred pending spikes (CEO, 2026-07-17): two cheap experiments —
   approval as a recorded tool call, and step-shot diff stability (§12.11) — run as staff work, and the
   build/no-build call returns to the CEO with their results.*
4. **The name — `claude-plugin-spec` is an explicit placeholder.** *(Set 2026-07-17 so the repo could
   exist; the CEO will rename later. It replaced `claude-mcp-debugger`, which was worse: the tool is
   neither a debugger nor an MCP thing — MCP Apps is one delivery surface for one half of it.)*

   Two known problems, recorded so the rename does not get forgotten:
   - **It misparses.** `claude-plugin-spec` reads most naturally as *"the specification **for** Claude
     plugins"* — a different product. Harmless while private and single-reader; misleading to the first
     outsider.
   - **`claude-` is Anthropic's trademark.** Harmless on a private repo; a real problem in a marketplace
     or on npm.

   **The rename stays cheap only while the repo is private, unpushed anywhere public, and unpublished.**
   That is the deadline — once it is a plugin id someone typed or a package someone installed, it is
   permanent. **Made concrete 2026-07-17: the rename is a phase-4 gate (§11) — no plugin manifest,
   marketplace entry, or npm publish happens under the placeholder.** **CEO 2026-07-17: continue under
   the placeholder for now; rename later. The phase-4 gate stands.** Shortlists already rejected, kept so the next attempt does not restart: `plumb` / `trueup` /
   `keel` / `specanchor` (descriptive); `cairn` / `fathom` / `quoin` / `kestrel` / `vellum`; and at 4–5
   letters **`canon`** (the code already calls the winning side the *canonical position* —
   `fixPlanFor(finding, canonicalPositionId)`), `datum` (the fixed reference every measurement is taken
   from), `writ`, `moor`. Every short English word is taken on npm, but a scope (`@fumia/…`) frees all of
   them — **npm is not a constraint on the choice.**
5. **Distribution** — private to the team first, or public? Gates whether the PRD's DojoStack-specific
   examples need scrubbing. **RESOLVED 2026-07-17 (CEO): private to the team first.** Public waits for
   the rename (§12.4) and the PRD scrub this question exists to gate.
6. **Config file name/location** in a consuming project. *Provisionally `kg.config.json` at the
   workspace root (2026-07-17) — phase 2 needed a name to load. Staff's pick, not a decision: it is one
   exported constant (`CONFIG_FILE` in `config.ts`) and every reference goes through it, so renaming is
   a one-line change for as long as nobody has written one. That deadline is the same as §12.4's.*
7. **`resolveBackendVenvPython`** — a generic tool arguably should not know what a Python venv is;
   probably an opaque command the project supplies. *Still open, deliberately: phase 2 removed only the
   hardcoded LOCATIONS (`repoRoot`/`backendDir` were already parameters), which is all REQ-0 forced. The
   knowledge that a backend is Python, runs under uvicorn as `main:app`, and that a frontend runs
   `npm run dev` with `NEXT_PUBLIC_*` env still sits in `serve.ts` — REQ-0 cannot see it because none of
   it spells "dojostack". **A generic tool that hardcodes uvicorn is not generic; REQ-0 just cannot say
   so.** That is a real gap in the requirement, not only in the code.*
8. **Do `flows` labels belong in config**, or can they derive from the feature registries the graph
   already reads?
9. **Does REQ-0 measure the right thing?** *Raised by making it green, 2026-07-17.* It greps for one
   project's name, so it goes green when the tool stops naming DojoStack — not when the tool stops
   assuming DojoStack. §12.7 above is the proof: `uvicorn main:app` passes REQ-0 today. The grep was the
   right instrument for the port (it decays honestly and anyone can run it) and it caught real coupling
   in files nobody would have thought to look at, including two written during phase 2 itself. But
   "names no project" is a proxy for "assumes no project", and the gap between them is now where the
   remaining coupling lives. Bears on §12.1's successor: a committed fixture repo whose graph is
   asserted would test the assumption rather than the spelling.
10. **Conflict-scan precision — measured, not assumed.** *(Added 2026-07-17, from review.)* Every
    genuine conflict cited in §6 is semantic and cross-language: a tax basis in TS vs Python, an enum,
    a denominator, a weighting. What detects that kind, and at what false-positive rate? The decision
    inbox lives or dies on precision — too many spurious findings and the CEO stops opening it, which
    is the `|| echo` failure recurring one layer up: the signal exists and nobody looks. Before any
    inbox ships, measure precision on DojoStack's corpus, where the true conflicts are already
    catalogued.
11. **Screenshot-diff stability.** *(Added 2026-07-17, from review.)* §6 and §10.11 rest on "two
    screenshots diff". Visual diffing's classic failure is the false positive — fonts, animation
    timing, dates, CI-vs-local rendering — the anti-flake problem Percy and Chromatic exist to solve.
    If step-shot diffs are noisy, flow-approval drowns in spurious "this flow changed — intended?" and
    the inbox becomes spam. Cheap spike before designing §12.3 any further: are `pacedStep` step-shots
    stable across runs and machines, and if not, what normalization makes them so?
12. **A flake policy for the blocking gate.** *(Added 2026-07-17, from review.)* §9c is right that
    report-only is decoration — but a blocking gate over a flaky Playwright suite is exactly the
    pressure that produced `|| echo` in the first place. Retries, a quarantine lane, a flake budget —
    something must keep the gate credible without teaching people to bypass it, and it must be decided
    before the gate blocks anyone.
