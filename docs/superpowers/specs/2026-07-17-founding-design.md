# kg-tool — Founding Design

- **Date:** 2026-07-17
- **Status:** Founding design note (agreed in brainstorm). The project's first artifact.
- **Output type:** Design note — the shape, the phasing, and the rules this project runs by.
- **Prior art:** `dojostack_main/tools/knowledge-graph/` (the in-tree original, ~55 modules / 438 tests);
  its PRD `.github/system-design/KNOWLEDGE_GRAPH_TOOL.md`; the design notes
  `2026-07-14-greenfield-spec-first-mode-design.md`, `2026-07-16-kg-gate-pinned-sources-design.md`,
  `2026-07-17-kg-config-extraction-design.md`.

---

## 1. Why this project exists

The Knowledge & Test Graph is a **verified single source of truth for spec-anchored development**: a
machine-checkable graph tying every requirement to a real test, with drift blocked by a gate and
contradictions detected. Its primary consumer is the **AI agent**; the human only glances (correct?
covered? UI not broken?) and adjudicates.

It was built inside `dojostack_main`, and it has outgrown that home for two measured reasons.

**It is squatting in the source of truth it protects.** Measured 2026-07-17:

```
nodes that ARE the tool itself : 96   (39 REQ-KG-* requirements + 57 of its own unit tests)
total nodes `main` contributes : 80
→ the tool is 71% of everything main puts in the graph
```

DojoStack's SSoT for a commercial real-estate platform is, on the `main` side, 71% occupied by the dev
tool that builds it.

**And it cannot be reused while it is welded to one repo.** Twelve non-test source files hardcode
`dojostack_backend` / `dojostack_frontend`.

## 2. What this project is — one repo, three consumers

The tool is three things wearing one coat, and thinking of it as only a "Claude plugin" would forget the
half that matters most (the gate runs in CI, where Claude Code does not exist):

| part | vehicle | consumer |
|---|---|---|
| builder + gate (`build` / `check` / `sync`) | **npm package** | GitHub Actions |
| the 5 skills (`kg-spec`, `kg-e2e`, `kg-scan-conflicts`, `kg-fix-conflicts`, `add-test`) | **Claude plugin** | Claude Code |
| viewer | generated artifact | the consuming project's repo |

A plugin's source *is* a git repo with a `package.json` — so one repo serves all three. `superpowers` is
shaped this way.

```
kg-tool/
  .claude-plugin/plugin.json   # plugin manifest
  package.json                 # npm package
  src/                         # builder + gate
  skills/                      # the 5 kg-* skills
  viewer.template.html
  .github/system-design/       # its own PRD — its spec, self-hosted
  kg.config.json               # its own config, pointing at itself
  docs/superpowers/specs/      # design notes (pre-ratification scaffolding)
```

## 3. Requirement zero

> **REQ-0** — *Given any repo root supplied as configuration, the tool builds a byte-identical graph to
> the one DojoStack's in-tree copy produces — knowing nothing about DojoStack.*

One sentence that is simultaneously the port's acceptance criterion, the proof that genericization
worked, and the first honest test that "reusable" is real rather than aspirational. **It fails today**,
because the topology is hardcoded; it goes green exactly when config lands.

## 4. The oracle — why a ~55-module port is not an act of faith

The graph is a **pure function of the tree**. Proven 2026-07-17: `buildGraph()` at a pinned timestamp,
normalized exactly as `check.ts`'s `normalizeForCompare` does, SHA256'd — **byte-identical across
darwin-arm64, linux-arm64 and linux-x64** (1392 nodes / 1965 edges / 13,578,939 bytes at the time).

Every entrypoint already honours `KG_REPO_ROOT`, so **the oracle survives the move**: this repo's ported
tool, pointed at `dojostack_main`, must reproduce the same hash. That single fact is what makes
"move first, then genericize" safe rather than reckless — the baseline was never tied to living inside
DojoStack.

**The contract is the method, not a literal hash.** The fingerprint moves whenever DojoStack's tree
changes. Each phase captures it fresh from an unmodified tree, changes only tool code, and asserts it
unchanged.

Guarding the port and the genericization **separately** is the point:

1. **Port as-is** → hash must match immediately. Same code, so this proves only that the *move* was
   clean — which is the one thing it needs to prove.
2. **REQ-0 is RED** — topology still hardcoded.
3. **Genericize** → REQ-0 goes green **and** the hash still matches: behaviour preserved, DojoStack
   knowledge gone.

## 5. Self-hosting is the single-repo proof

`kg-tool` is a **one-repo** project; DojoStack is the three-repo case. So the tool cannot govern itself
while it still believes the world contains `dojostack_backend/`. **Self-hosting and the single-repo
proof are the same work** — the dogfood is not symbolic, it is the test.

## 6. How this project runs (its rules, chosen — not inherited)

DojoStack's ceremony does **not** apply here: no Stop hooks, no mandatory review agent, no `soc-gate`.
This project sets its own rules, written down rather than absorbed by accident:

1. **Spec before code.** Every behaviour change starts as an approved requirement. The human states and
   approves the requirement text; that is the one decision only they can make.
2. **One failing test per requirement, first.** This is *not* inherited ceremony — it is the product
   thesis. Per the field's taxonomy, *spec-first* (spec, then code) is **drift-prone**; *spec-anchored*
   (**tests enforce alignment**) is the sweet spot, and "machine-enforced non-drift" is this tool's
   entire claim against the field. Building the anti-drift tool by the drift-prone method would refute
   it on the first commit.
   **Evidence, not doctrine:** DojoStack's gate was a `|| echo`, and in that gap **70 requirements
   landed with zero tests**; coverage fell 52% → 48%. That is what spec-without-enforcement produces.
3. **Promote-when-tested.** A requirement is staged in prose and promoted to frontmatter with a real
   `covers:` **only as its test lands** — never up front. (Inherited deliberately: it is the one rule
   that provably worked.)
4. **Docs are corrected in place, not conformed to the code.** When the code teaches you the spec was
   wrong, fix the spec and say why. The inverse is how a requirement quietly becomes false.
5. **The gate blocks.** Once it can, it does. A report-only gate is a decoration.

## 7. Phases

| # | What | Done when |
|---|---|---|
| **1** | Port `src`/tests/PRD/viewer; `git init`; npm deps | fingerprint vs `dojostack_main` matches |
| **2** | Genericize onto `kg.config.json` (topology → paths → runners) | REQ-0 green; fingerprint still matches |
| **3** | Self-host: own config, own graph, own gate | its 39 `REQ-KG-*` live in its own graph |
| **4** | Plugin manifest + marketplace; skills move | installable |
| **5** | Rewire DojoStack: delete `tools/knowledge-graph/`, consume the npm dep | DojoStack's graph is purely DojoStack |

DojoStack keeps its **artifacts** (graph, viewer, baseline, lockfile), its **config**, and its
**workflow** — those are its data, not the tool. `tools/knowledge-graph/` keeps working untouched until
phase 5, so nothing breaks while this is built.

## 8. Decisions locked in this brainstorm

1. **v1 = the KG tool ported** (builder + gate + skills), not a skills-only plugin (the conversation half
   without the enforcement half is the drift-prone shape again) and not a from-scratch rewrite.
2. **Move first, then genericize** — reversing the earlier "genericize in place" call, because
   `KG_REPO_ROOT` means the oracle survives the move. The original reasoning ("no baseline to compare
   against") was simply wrong.
3. **One repo, three consumers** — npm + plugin + self-hosted.
4. **Tests port with the code.** "Forget the TDD rule" means dropping DojoStack's ceremony, not the
   anchor.
5. **DojoStack is rewired last**, so nothing breaks in the meantime.

## 9. Open questions

1. **Name.** `kg-tool` is a working title; it becomes the plugin id, the npm package name and the
   marketplace entry, and all three hurt to change once anyone installs it. Decide before phase 4.
2. **Marketplace + distribution** — private to the team first, or public? Gates whether the PRD's
   DojoStack-specific examples need scrubbing.
3. **Config file name/location** in a consuming project — repo-root `kg.config.json`?
4. **`resolveBackendVenvPython`** — a generic tool arguably should not know what a Python venv is; it may
   belong in `runners` as an opaque command the project supplies. *Leaning:* opaque command.
5. **Do `flows` labels belong in config at all**, or can they derive from the feature registries the graph
   already reads? Deriving would delete a config surface entirely.
6. **Does the graph's own `conflicts/` data move or stay?** It is project data, so probably stays — but
   the scanner is tool code.
