// codeCandidates.ts — the scan surface for a repo that arrived with NO docs.
//
// The doc-anchored enumerator (conflictCandidates.ts) derives every pair from a graph edge:
// `references`, `governs`, `covers`. That is precise, and on the customer this product is actually for
// — code and an AI agent, nothing else — it yields exactly nothing, because none of those edges exists
// until somebody writes a doc. The differentiated claim (a bare repo gets its first requirements from
// its own contradictions) needs a surface that reaches code directly.
//
// THE BOUND MOVES, IT DOES NOT DISAPPEAR. Pairs come from a shared DECLARED SYMBOL: two files that
// declare no name in common never become a candidate. This is still enumeration from the tree, not a
// free hunt through it — the AI adjudicates a list it was handed.
//
// Deliberately language-light. A real parser per language would be more precise and would also be a
// dependency per language; a declaration regex over the common shapes gets the signal that matters
// (the same rule implemented twice under the same name) at a fraction of the cost.
import micromatch from "micromatch";
import type { CandidatePair } from "./conflictCandidates";

/** The near-universal spelling of a test file, used only as a FLOOR under whatever the project
 *  declares — a project that configured nothing must still not have its suites read as behaviour. */
const TEST_NAME = /(^|\/)(tests?|spec|__tests__)\//i;
const TEST_FILE = /(\.|_|\b)(test|spec)s?\.[a-z]+$|(^|\/)test_[^/]+$/i;

/**
 * PURE. Is this file PROOF rather than behaviour?
 *
 * Behaviour lives in source; a test states what source must do. Two suites sharing a fixture name
 * (`CONFIG`, `PINNED`, `NO_GIT`) is a convention, not a disagreement — and on this repo that noise was
 * 59% of the code surface. Asked of the project's own declared globs first, so the tool is not
 * legislating where anybody keeps their tests.
 */
export function isProofFile(path: string, config: { unitTestGlobs: string[]; e2eDir: string }): boolean {
  const p = path.replace(/\\/g, "/");
  if (config.unitTestGlobs.length && micromatch.isMatch(p, config.unitTestGlobs)) return true;
  if (config.e2eDir && (p === config.e2eDir || p.startsWith(config.e2eDir + "/"))) return true;
  return TEST_FILE.test(p) || TEST_NAME.test(p);
}

/** Source extensions worth reading. Anything else is data, build output, or prose. */
export const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|php|cs|scala|sql)$/i;

// MODULE SCOPE OR EXPORTED, never an indented local. A rule lives on a module's surface; a `const`
// inside a function body is a working variable, and matching those paired `agentContext.ts` with
// `selectCases.ts` because both happened to name something `tests` — 149 such pairs on this repo,
// every one of them a naming coincidence. Anchoring to column 0 is what makes a shared name evidence.
const DECL = new RegExp(
  [
    "^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)",
    "^(?:export\\s+)?(?:abstract\\s+)?class\\s+([A-Za-z_$][\\w$]*)",
    "^(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)",
    "^(?:export\\s+)?(?:interface|type|enum)\\s+([A-Za-z_$][\\w$]*)",
    "^(?:export\\s+)?def\\s+([A-Za-z_][\\w]*)",
    "^func\\s+([A-Za-z_][\\w]*)",
    "^([A-Z][A-Z0-9_]{3,})\\s*=", // module-level CONSTANT_CASE (python/ruby/js)
  ].join("|"),
  "gm",
);

/**
 * PURE. Every name this file declares, deduped and sorted.
 *
 * Names shorter than four characters are dropped: `x`, `id`, `fn` and friends are declared in half a
 * codebase, and a symbol that pairs everything with everything produces a surface nobody can triage.
 */
export function declaredSymbols(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(DECL)) {
    const name = m.slice(1).find(Boolean);
    if (name && name.length >= 4) out.add(name);
  }
  return [...out].sort();
}

export interface CodeFile { path: string; text: string }

export interface CodeCandidateOpts {
  /** A symbol declared in more files than this is ubiquitous, not distinctive. */
  maxFilesPerSymbol?: number;
  /** Hard cap on emitted pairs, so a huge repo cannot produce an untriageable surface. */
  limit?: number;
  withReport?: boolean;
}

const DEFAULTS = { maxFilesPerSymbol: 5, limit: 400 };

/**
 * PURE. Candidate code↔code pairs: two files sharing at least one distinctive declared symbol.
 *
 * Sorted and deduped, so the same tree always enumerates the same surface — a pair is emitted once
 * however many symbols two files happen to share, because it is one thing to adjudicate.
 */
export function codeCandidatePairs(files: CodeFile[], opts: CodeCandidateOpts & { withReport: true }): { pairs: CandidatePair[]; dropped: number };
export function codeCandidatePairs(files: CodeFile[], opts?: CodeCandidateOpts): CandidatePair[];
export function codeCandidatePairs(files: CodeFile[], opts: CodeCandidateOpts = {}): CandidatePair[] | { pairs: CandidatePair[]; dropped: number } {
  const maxFiles = opts.maxFilesPerSymbol ?? DEFAULTS.maxFilesPerSymbol;
  const limit = opts.limit ?? DEFAULTS.limit;

  const bySymbol = new Map<string, string[]>();
  for (const f of files)
    for (const s of declaredSymbols(f.text)) bySymbol.set(s, [...(bySymbol.get(s) ?? []), f.path]);

  // Accumulate every symbol a pair shares, so the emitted pair can SAY what to compare rather than
  // making the adjudicator re-derive it by reading both files end to end.
  const shared = new Map<string, Set<string>>();
  for (const [symbol, paths] of [...bySymbol.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const uniq = [...new Set(paths)].sort();
    if (uniq.length < 2 || uniq.length > maxFiles) continue;
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) {
        const key = `${uniq[i]}|${uniq[j]}`;
        shared.set(key, (shared.get(key) ?? new Set()).add(symbol));
      }
  }

  const all = [...shared.keys()].sort().map((k) => {
    const [a, b] = k.split("|");
    return { kind: "code-code" as const, a, b, sharedSymbols: [...shared.get(k)!].sort() };
  });
  const pairs = all.slice(0, limit);
  return opts.withReport ? { pairs, dropped: all.length - pairs.length } : pairs;
}
