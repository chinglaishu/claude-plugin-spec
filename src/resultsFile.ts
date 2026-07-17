/** R2-B additive fields: `error` = cleaned first error message (failed cases only);
 *  `commit` = the short sha sync:results recorded THIS entry at (per-entry so a scoped
 *  merge stays honest — untouched entries keep the commit they were really recorded at).
 *  Both optional: v1 strings and pre-R2B v2 objects have neither, and normalization
 *  never invents values for old entries. */
export interface ResultEntryV2 { status: string; attempts: number; at: string; error?: string; commit?: string; suggestedFix?: string; suggestedFixAt?: string; suggestedFixBy?: string }
export interface ResultsFileV2 { generatedAt: string; commit: string; results: Record<string, ResultEntryV2> }

/** Accept both the legacy v1 form (`"hv-1": "pass"`) and v2 objects. */
export function normalizeResults(json: string): ResultsFileV2 {
  const parsed = JSON.parse(json) as { generatedAt: string; commit: string; results: Record<string, string | ResultEntryV2> };
  const results: Record<string, ResultEntryV2> = {};
  for (const [id, v] of Object.entries(parsed.results ?? {})) {
    results[id] = typeof v === "string" ? { status: v, attempts: 1, at: parsed.generatedAt } : v;
  }
  return { generatedAt: parsed.generatedAt, commit: parsed.commit, results };
}

/** Scoped runs upsert into the existing map (other cases keep their own `at`); full runs replace it. */
export function mergeResults(existing: ResultsFileV2 | null, incoming: ResultsFileV2, scoped: boolean): ResultsFileV2 {
  const results = scoped && existing ? { ...existing.results, ...incoming.results } : { ...incoming.results };
  return { generatedAt: incoming.generatedAt, commit: incoming.commit, results };
}
