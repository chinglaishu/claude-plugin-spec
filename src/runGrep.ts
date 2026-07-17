// src/runGrep.ts — pure decision for HOW syncResults scopes a Playwright run.
//
// Windows caps a command line at ~8191 chars. Passing a subset filter as `-g "<N escaped titles
// ORed>"` on argv overflows that for large scopes (the observed bug: an unscoped run of all ~85
// cases across ~40 specs → "The command line is too long" → Playwright produces no report → abort).
// The fix routes the grep through the E2E_KG_GREP env var instead (env has a ~32KB Windows limit,
// far above argv), and skips it entirely for a full run where a grep of every case is pointless.

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The grep regex string to hand to Playwright via the E2E_KG_GREP env var, or `undefined` to run
 * with NO grep (all matched specs run):
 *   - unscoped full run  → undefined (don't bother greping every case);
 *   - scoped run         → the case titles, each regex-escaped, ORed with `|`;
 *   - scoped but empty   → undefined (nothing to filter to).
 */
export function buildRunGrep(titles: string[], scoped: boolean): string | undefined {
  if (!scoped || titles.length === 0) return undefined;
  return titles.map(escapeRegex).join("|");
}
