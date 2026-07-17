# kg-tool — Founding Design

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
while people and AI keep changing the code around it.

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

## 4. CEO ↔ staff — the north star everything derives from

> Human = **CEO**: writes the requirement SSoT, answers only the decisions staff can't make, reviews at
> milestones. AI = **staff**: works to the doc. Implied product shape: **staff tooling** (context for
> agents + a drift gate) + **CEO cockpit** (SSoT · a decision inbox for conflicts/open-questions · review).

The sharp consequence: **the CEO's only gate is approving requirement text.** They never read a long
spec. They never watch the process. They state intent and approve words — and, for UI behaviour, approve
a *flow* (§6).

## 5. The three deliverables — and the missing one is the gold

| # | deliverable | status |
|---|---|---|
| 1 | **The platform** — graph, conflict scan, requirement→test linkage, the gate | mostly built |
| 2 | **The skills** — `kg-spec`, `kg-e2e`, `kg-scan-conflicts`, `kg-fix-conflicts`, `add-test` | built |
| 3 | **The staff prompt** — how the AI must behave | **does not exist** |

**(3) is the gold and it is the cheapest.** The platform can detect every contradiction in a repo and
change *nothing* if staff never looks before coding. A perfect graph nobody consults is an expensive
lint. The staff prompt is what makes (1) and (2) pay off — it is the difference between "the tool knows"
and "the tool is used". Its search-first mechanism already has a prototype (`agent-context.mjs`: given a
file, print its governing spec + requirements + covering tests + conflicts).

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

## 7. Requirement zero

> **REQ-0** — *Given any repo root supplied as configuration, the tool builds a byte-identical graph to
> the one DojoStack's in-tree copy produces — knowing nothing about DojoStack.*

Simultaneously the port's acceptance criterion, the proof genericization worked, and the first honest
test that "reusable" is real rather than aspirational. **It fails today** — the topology is hardcoded in
twelve files — and goes green exactly when config lands.

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

**Self-hosting is the single-repo proof.** `kg-tool` is a one-repo project; DojoStack is the three-repo
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
   Existing untouched code stays legal; new ungoverned code fails the build. No new UI. *(Blocked on
   §11.1.)*
4. **The staff prompt is a first-class deliverable**, shipped as a skill plus a `UserPromptSubmit` hook
   that routes coding tasks through it.
5. **One repo, three consumers** — npm package (CI runs the gate, where Claude Code does not exist),
   Claude plugin (the skills + hook), self-hosted (its own graph).
6. **Move first, then genericize** — `KG_REPO_ROOT` means the oracle survives the move.
7. **DojoStack is rewired last**, so nothing breaks meanwhile.

**Rewritten 2026-07-17**, hours after the first draft, because the scope narrowed to (3)+(4), the staff
prompt was identified as the gold, design drift was cut, greenfield was reframed from a tab to an issue
kind, and flows were recognised as the CEO's language for UI. Recorded rather than silently replaced —
per the rule that docs get corrected in place, with the reason attached.

## 11. Open questions

1. **Will `governs:` be adopted?** Nine docs of 272 declare it today. Decision 10.3 is dead without it —
   detection would report "everything is ungoverned", which is true, useless, and instantly ignored. **The
   real question is whether declaring which code a spec governs is a habit worth keeping.** Resolve before
   building any detection.
2. **Build flow-approval (§6)?** The most differentiated idea here and entirely undesigned. Overlaps
   Percy/Chromatic on approve-the-diff; the novelty is that approval **ratifies a requirement** rather
   than blessing a screenshot.
3. **The name.** `kg-tool` is a working title and becomes the plugin id, the npm package and the
   marketplace entry. Cheap now, painful after anyone installs it.
4. **Distribution** — private to the team first, or public? Gates whether the PRD's DojoStack-specific
   examples need scrubbing.
5. **Config file name/location** in a consuming project.
6. **`resolveBackendVenvPython`** — a generic tool arguably should not know what a Python venv is;
   probably an opaque command the project supplies.
7. **Do `flows` labels belong in config**, or can they derive from the feature registries the graph
   already reads?
