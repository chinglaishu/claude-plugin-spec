export type NodeType = "doc" | "test" | "requirement" | "instruction" | "agent" | "hook" | "feature" | "cache-entry";

/** A cache entry's backing store. */
export type CacheKind = "fe-query" | "fe-store" | "be-redis" | "be-lru";
export type EdgeType =
  | "references" | "verifies" | "specifies" | "covers" | "governs"
  | "exercises" | "imports" | "applies-to" | "triggers" | "activates-on" | "tags";

/** A test node's kind. e2e = authored *.cases.yaml; unit-fe = Vitest; unit-be = pytest. */
export type TestKind = "e2e" | "unit-fe" | "unit-be";

export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  path?: string;
  created?: string;    // file-backed node: ISO date (YYYY-MM-DD) of the first git commit touching the file
  updated?: string;    // file-backed node: ISO date (YYYY-MM-DD) of the last git commit touching the file
  reviewedAt?: string; // doc: frontmatter `last_reviewed` (YYYY-MM-DD) when present
  lens?: string;
  domain?: string;
  status?: string;
  entrypoint?: boolean;
  governs?: string[];
  text?: string;       // requirement text / short description (test: the "what" — describe/it title)
  summary?: string;    // test (unit): the "why" — cleaned prose from the file's leading comment block / module docstring
  spec?: string;       // test: originating spec file
  body?: string;       // full markdown body (post-frontmatter) for doc/instruction — powers the viewer's content pane
  sections?: DocSection[]; // doc: deterministic H2/H3 section classification (contract 4) — powers per-section chips + mini-TOC
  steps?: TestStep[];  // test: authored step-by-step reproduction (action, expected, optional screenshot)
  playwrightTitle?: string; // test: exact Playwright `test("…")` title to pass as -g when running just this case
  kind?: TestKind;     // test: e2e | unit-fe | unit-be
  parallelSafe?: boolean; // test (e2e): case mutates no shared backend state → poolable in a headless batch
  e2eKind?: "flow" | "feature"; // test (e2e): authored `kind:` in *.cases.yaml — splits the Playwright block into Flow vs Feature tests. Default "feature".
  testCount?: number;  // test (unit): number of it()/def test_ functions in the file
  source?: string;     // test (unit): full file source, so the viewer can show the real test code
  attempts?: number;   // test: run attempts from kg-test-results.json v2 (>1 = it retried)
  runAt?: string;      // test: ISO timestamp of the run that produced this status
  flaky?: boolean;     // test: passed only on retry (attempts > 1 && status pass)
  lastError?: string;  // test: cleaned first error message of the recorded failure (R2-B; failed cases only)
  suggestedFix?: string; // test (e2e): AI-authored fix suggestion for a failing case (from the results file, 2b); esc()'d in the viewer
  runCommit?: string;  // test: short sha the recorded result was captured at (per-entry, honest under scoped merges)
  evidence?: Record<string, string>; // test (e2e): screenshot filename -> raw evidence-branch URL (contract 3)
  flow?: string;       // feature: parent flow id that groups its sub-features (e.g. "add")
  paths?: string[];    // feature: source-path globs; a test whose path matches one is tagged to this feature
  page?: boolean;      // feature: true = a page-level "overview" feature (its requirements describe the whole page)
  star?: boolean;      // feature: true = favourite / curated-important. Drives the ★ badge and the "Favourites only" filter.
  provenBy?: string[]; // requirement: case/test slugs authored as proving it (resolved to nodes in the viewer)
  criteria?: string[]; // requirement: authored acceptance-criteria bullets
  cacheKind?: CacheKind;   // cache-entry: fe-query | fe-store | be-redis | be-lru
  ttl?: string;            // cache-entry: human TTL (e.g. "5 min")
  populate?: string;       // cache-entry: hook/function that fills it
  invalidate?: string[];   // cache-entry: real bust sites (empty = staleness risk)
}

export interface TestStep {
  action: string;
  expected: string;
  screenshot?: string;   // path or filename of the captured PNG (viewer renders as a thumbnail)
}

/** One H2/H3 section of a doc body, classified by deterministic heuristic (contract 4). */
export interface DocSection {
  anchor: string;   // GitHub-style slug of the heading text
  title: string;    // the heading text, verbatim
  kind: "requirement" | "decision" | "open-question" | "knowledge";
  reqIds: string[]; // REQ-… ids mentioned anywhere in the section, regardless of kind (e.g. a decision section discussing a requirement still lists it)
}
export interface GraphEdge { from: string; to: string; type: EdgeType; source: string; }
export interface Issue { kind: string; node?: string; from?: string; to?: string; detail: string; }
export interface HealthFlow {
  flow: string; label: string;
  capabilities: number; tested: number;
  untested: string[];                       // feature LABELS (not ids) with zero tagged tests
  failing: { id: string; title: string }[];
  flaky: { id: string; title: string }[];
  reqTotal: number; reqProven: number;
  unproven: string[];                       // requirement texts with no covering test
  lastVerified: string | null;              // OLDEST runAt among tagged e2e tests that have one (worst-case honesty)
}
export interface Health {
  flows: HealthFlow[];
  totals: { features: number; tested: number; reqTotal: number; reqProven: number; failing: number; flaky: number };
}
export interface Graph {
  generatedAt: string;
  lastRun?: { at: string; commit: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
  issues: Issue[];
  health?: Health;
  /** Viewer-only payload: *.features.yaml basename → raw file text, powering the in-viewer
   *  registry document page. NOT nodes/edges — never influences issues or the ratchet.
   *  Keys are inserted sorted so JSON serialization is deterministic. */
  registries?: Record<string, string>;
  /** Viewer-only payload: AI-authored contradiction findings folded from
   *  conflicts/*.conflicts.json. NOT nodes/edges — never influences issues or the ratchet.
   *  Deterministically deduped-by-id and sorted so serialization is byte-stable. */
  conflicts?: ConflictFinding[];
}

export type ConflictAxis = "doc" | "code" | "mixed";
export interface ConflictParticipant {
  kind: "doc" | "code" | "req" | "test";
  ref: string;        // node id (doc/req/test) or code path (code)
  span?: string;      // section anchor / line hint
  quote: string;      // exact text taken from the source
  positionId: string; // which position (camp) this participant holds
}
export interface ConflictPosition { id: string; statement: string; heldBy: string[]; } // heldBy = participant refs
export interface ConflictFinding {
  id: string;         // conflictId(subject, scope)
  subject: string;
  scope: string;      // flow / feature / domain
  category: string;   // ordering | formula | terminology | scope | stale-reference | ...
  severity: "high" | "med" | "low";
  axis: ConflictAxis; // DERIVED from participant kinds
  tags: string[];
  why: string;
  participants: ConflictParticipant[];
  positions: ConflictPosition[];
}

/** Every parser returns this shape so the assembler can concat uniformly. */
export interface ParseResult { nodes: GraphNode[]; edges: GraphEdge[]; }
