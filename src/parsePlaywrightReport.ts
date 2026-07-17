interface PwError { message?: string }
interface PwAttachment { name?: string; contentType?: string; path?: string }
interface PwResult { status?: string; errors?: PwError[]; error?: PwError; attachments?: PwAttachment[] }
interface PwSpec { title: string; ok: boolean; tests?: { results?: PwResult[] }[] }
interface PwSuite { title?: string; suites?: PwSuite[]; specs?: PwSpec[] }

const ANSI_RE = /\u001b\[[0-9;]*m/g;
const MAX_ERROR_CHARS = 300;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Filesystem-absolute prefix ending in one of the workspace's repo folders → strip to repo-relative
 * (e.g. "C:\Users\…\svc_frontend\e2e\x.spec.ts" → "e2e\x.spec.ts"). Windows and POSIX separators
 * both handled; no user-name/machine-path leakage.
 *
 * The folder names come from config (`repoDirNames`) rather than a baked-in literal. No names at all
 * is a legitimate degenerate case, and yields a matcher that strips NOTHING rather than one that
 * strips everything — an empty alternation `(?:)` would match at every position.
 */
function absRepoPrefixRe(repoDirs: string[]): RegExp | null {
  if (!repoDirs.length) return null;
  const names = repoDirs.map(escapeRe).join("|");
  return new RegExp(String.raw`(?:[A-Za-z]:)?[\\/](?:[^\\/\r\n"']+[\\/])*(?:` + names + String.raw`)[\\/]`, "g");
}

/** First non-empty line(s) of a Playwright error message, ANSI-stripped,
 *  absolute-path prefixes removed, capped at ~300 chars. */
function cleanErrorMessage(raw: string, repoDirs: string[]): string | undefined {
  const absRe = absRepoPrefixRe(repoDirs);
  const noAnsi = raw.replace(ANSI_RE, "");
  const lines = (absRe ? noAnsi.replace(absRe, "") : noAnsi)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;
  let out = lines[0];
  for (let i = 1; i < lines.length && out.length < MAX_ERROR_CHARS; i++) {
    if (out.length + 1 + lines[i].length > MAX_ERROR_CHARS) break;
    out += "\n" + lines[i];
  }
  return out.length > MAX_ERROR_CHARS ? out.slice(0, MAX_ERROR_CHARS - 1) + "…" : out;
}

export interface ParsedCaseResult { status: string; attempts: number; error?: string }

/** Walk the Playwright JSON reporter output; map spec titles to case ids with status + attempts.
 *
 * Only EXECUTED attempts count. A test that never ran — auth/setup failure
 * ("did not run": `ok: true` with an empty results array) or a skip
 * (`test.fixme`, serial-mode skip after an earlier failure in the chain) —
 * must NOT be recorded: `spec.ok` is true for skipped/unrun tests, so recording
 * it would fabricate a `pass` for a test that never executed. Skipped entries
 * are also excluded from `attempts` so a serial-chain retry (results
 * `[skipped, passed]`) counts as one real attempt, not a phantom "flaky" two.
 *
 * R2-B: FAILED cases additionally carry `error` — the first attempt's first
 * error message, ANSI-stripped, absolute paths reduced to repo-relative,
 * first non-empty line(s) capped at ~300 chars. Passing cases never carry one
 * (a retried-then-passed case's first-attempt error is flake noise, not signal). */
export function parsePlaywrightJson(reportJson: string, titles: Map<string, string>, repoDirs: string[] = []): Record<string, ParsedCaseResult> {
  const root = JSON.parse(reportJson) as { suites?: PwSuite[] };
  const out: Record<string, ParsedCaseResult> = {};
  const walk = (s: PwSuite) => {
    for (const spec of s.specs ?? []) {
      const caseId = titles.get(spec.title);
      if (!caseId) continue;
      const results = spec.tests?.[0]?.results ?? [];
      const executed = results.filter((r) => r.status && r.status !== "skipped");
      if (executed.length === 0) continue; // never ran — keep the previous recorded result
      const entry: ParsedCaseResult = { status: spec.ok ? "pass" : "fail", attempts: executed.length };
      if (!spec.ok) {
        const firstMsg = executed.map((r) => r.errors?.[0]?.message ?? r.error?.message).find((m) => m != null);
        const cleaned = firstMsg != null ? cleanErrorMessage(firstMsg, repoDirs) : undefined;
        if (cleaned) entry.error = cleaned;
      }
      out[caseId] = entry;
    }
    for (const child of s.suites ?? []) walk(child);
  };
  for (const s of root.suites ?? []) walk(s);
  return out;
}

export interface ResultScreenshot { name: string; path: string }
export interface LiveCaseResult { status: "pass" | "fail"; error: string | null; screenshots: ResultScreenshot[] }

/** Single-case live result for the /api/run `result` SSE (Feature 2a). Finds the spec whose
 *  title === playwrightTitle, returns its pass/fail, cleaned first error (fail only), and the
 *  image screenshot attachments of the first executed result. `path` is the raw report path;
 *  serve.ts rewrites it to a /run-artifacts URL before sending. Never throws on a malformed or
 *  title-less report — defaults to a clean pass so the panel degrades gracefully. */
export function parseCaseResult(reportJson: string, playwrightTitle: string, repoDirs: string[] = []): LiveCaseResult {
  let root: { suites?: PwSuite[] };
  try { root = JSON.parse(reportJson) as { suites?: PwSuite[] }; } catch { return { status: "pass", error: null, screenshots: [] }; }
  let found: PwSpec | undefined;
  const walk = (s: PwSuite) => {
    for (const spec of s.specs ?? []) if (spec.title === playwrightTitle) found ??= spec;
    for (const child of s.suites ?? []) walk(child);
  };
  for (const s of root.suites ?? []) walk(s);
  if (!found) return { status: "pass", error: null, screenshots: [] };
  const results = found.tests?.[0]?.results ?? [];
  const executed = results.filter((r) => r.status && r.status !== "skipped");
  const status: "pass" | "fail" = found.ok ? "pass" : "fail";
  if (status === "pass") return { status, error: null, screenshots: [] };
  const firstMsg = executed.map((r) => r.errors?.[0]?.message ?? r.error?.message).find((m) => m != null);
  const error = firstMsg != null ? cleanErrorMessage(firstMsg, repoDirs) ?? null : null;
  const shots: ResultScreenshot[] = [];
  for (const r of executed) {
    for (const a of r.attachments ?? []) {
      if (a.path && (a.contentType?.startsWith("image/") || /\.png$/i.test(a.path))) {
        shots.push({ name: a.path.split(/[\\/]/).pop() ?? "screenshot.png", path: a.path });
      }
    }
  }
  return { status, error, screenshots: shots };
}
