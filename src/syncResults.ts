// src/syncResults.ts — thin runner; mirrors serve.ts spawn conventions (shell:true, frontendDir cwd)
import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { casesForScope } from "./selectCases";
import { buildRunGrep } from "./runGrep";
import { parsePlaywrightJson } from "./parsePlaywrightReport";
import { mergeResults, normalizeResults, type ResultsFileV2 } from "./resultsFile";
import { shouldAutoUpload, uploadCaseArg } from "./shotsUploadHook";
import type { Graph } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolDir = join(__dirname, "..");
const repoRoot = process.env.KG_REPO_ROOT ?? join(toolDir, "..", "..");
const frontendDir = join(repoRoot, "dojostack_frontend");
const resultsPath = join(frontendDir, "e2e", "kg-test-results.json");
const REPORT_FILE = ".kg-run-report.json";

function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) =>
  new Promise<number>((resolve) => {
    const p = spawn(cmd, args, { cwd, shell: true, env, stdio: "inherit" });
    p.on("close", (code) => resolve(code ?? -1));
    p.on("error", () => resolve(-1));
  });

const flow = argOf("--flow");
const caseArg = argOf("--case");
const graph = JSON.parse(await readFile(join(toolDir, "knowledge-graph.json"), "utf8")) as Graph;
const cases = casesForScope(graph, flow, caseArg ? caseArg.split(",") : undefined);
if (!cases.length) { console.error("kg sync:results — no runnable cases match the scope"); process.exit(1); }
const scoped = Boolean(flow || caseArg);
console.log(`kg sync:results — running ${cases.length} case(s)${flow ? ` [flow=${flow}]` : ""}${scoped ? " (scoped: other cases keep their previous result)" : ""}`);

const specs = [...new Set(cases.map((c) => `e2e/${c.spec}`))];
// Route the case filter through the E2E_KG_GREP ENV var (read by playwright.config's `grep`), NOT a
// `-g "<…>"` argv. On Windows a `-g` of ~85 ORed titles + ~40 spec paths overflows the ~8191-char
// command line → "The command line is too long" → no report → abort. A full (unscoped) run skips the
// grep entirely (buildRunGrep → undefined) and just runs all specs. The spec paths stay on argv
// (short enough); the length-unsafe part is the grep, which env carries safely (~32KB Windows limit).
const grep = buildRunGrep(cases.map((c) => c.playwrightTitle), scoped);
const code = await run("npx", ["playwright", "test", ...specs, "--workers=1", "--retries=1", "--reporter=json"], frontendDir, {
  // E2E_KG_NO_AUTO=1: sync:results already records results + harvests shots + rebuilds below, so the
  // frontend's kgAutoUpdate reporter must NOT also run record:run for this child playwright process
  // (that would double-record and double-build). This flag disables the auto-update reporter here.
  ...process.env, FORCE_COLOR: "0", PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT_FILE, E2E_KG_NO_AUTO: "1",
  ...(grep ? { E2E_KG_GREP: grep } : {}),
});
// Non-zero exit just means some test failed — the report still exists and is what we record.
const reportJson = await readFile(join(frontendDir, REPORT_FILE), "utf8").catch(() => null);
if (!reportJson) { console.error(`kg sync:results — Playwright produced no ${REPORT_FILE} (exit ${code}); aborting without touching results`); process.exit(1); }
await unlink(join(frontendDir, REPORT_FILE)).catch(() => {});

const titles = new Map(cases.map((c) => [c.playwrightTitle, c.caseId]));
const parsed = parsePlaywrightJson(reportJson, titles);
const now = new Date().toISOString();
const commit = await new Promise<string>((resolve) => {
  const p = spawn("git", ["rev-parse", "--short", "HEAD"], { cwd: frontendDir, shell: true });
  let out = ""; p.stdout?.on("data", (d) => (out += d)); p.on("close", () => resolve(out.trim() || "unknown"));
});
const incoming: ResultsFileV2 = {
  generatedAt: now, commit,
  // R2-B: stamp the SAME short sha per-entry — a later scoped run overwrites only its own
  // entries, so untouched entries keep the commit they were actually recorded at.
  results: Object.fromEntries(Object.entries(parsed).map(([id, r]) => [id, { ...r, at: now, commit }])),
};
const existing = await readFile(resultsPath, "utf8").then(normalizeResults).catch(() => null);
const merged = mergeResults(existing, incoming, scoped);
await writeFile(resultsPath, JSON.stringify(merged, null, 2) + "\n");
const flaky = Object.values(parsed).filter((r) => r.status === "pass" && r.attempts > 1).length;
const fails = Object.values(parsed).filter((r) => r.status === "fail").length;
console.log(`kg sync:results — recorded ${Object.keys(parsed).length} result(s): ${fails} fail, ${flaky} flaky → ${resultsPath}`);

// Auto-upload evidence for the cases just run (spec §5 item 3): full batch or a --case scope
// covering >=1 case; KG_SHOTS_UPLOAD=0 disables. Failure is a loud warning only — a network/gh-auth
// hiccup here must never fail the results-recording path or block the sync chain below.
const caseIds = cases.map((c) => c.caseId);
if (shouldAutoUpload({ caseCount: caseIds.length, env: process.env })) {
  const caseArgValue = uploadCaseArg(caseIds)!;
  const uploadCode = await run("npx", ["tsx", "src/shotsUpload.ts", "--case", caseArgValue], toolDir, { ...process.env, FORCE_COLOR: "0" });
  if (uploadCode !== 0) console.warn(`kg sync:results — ⚠ evidence auto-upload failed (exit ${uploadCode}); results were still recorded above. Run \`npm run shots:upload\` manually once resolved.`);
}

// Bring every view current in the same command.
process.exit(await run("npx", ["tsx", "src/sync.ts"], toolDir, { ...process.env, FORCE_COLOR: "0" }));
