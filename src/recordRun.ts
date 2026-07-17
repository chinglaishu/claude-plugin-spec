// src/recordRun.ts — auto-update the Knowledge & Test Graph from ANY Playwright run.
//
// Given a Playwright JSON report file it (a) records per-case results into
// dojostack_frontend/e2e/kg-test-results.json (reusing parsePlaywrightJson + resultsFile's
// merge/commit-stamp, exactly as syncResults does), (b) harvests each test's `screenshot: "on"`
// attachment into e2e/.step-shots/<caseId>/<caseId>-result.png (EXACT per-test mapping from the
// report attachments — never fuzzy dir-name matching), then (c) rebuilds the viewer artifacts, and
// (d) optionally uploads evidence. It is wired to run from a Playwright globalTeardown so a plain
// `npx playwright test` keeps the graph current with zero manual `sync:results`.
//
// The pure logic (title→case map, screenshot resolution) is exported and unit-tested; the CLI
// entrypoint at the bottom is thin glue (real fs + spawn), mirroring shotsUpload.ts's split.

import { pathToFileURL } from "node:url";
import type { Graph } from "./types";
import type { ResultsFileV2 } from "./resultsFile";

const bareOf = (id: string): string => {
  const i = id.indexOf(":");
  return i >= 0 ? id.slice(i + 1) : id;
};

/** playwrightTitle → { caseId (LOWERCASE, to key results the way applyResults looks them up),
 *  dirId (ORIGINAL bare id, e.g. "ADD-4", to name the .step-shots subdir the same way pacedStep +
 *  the existing on-disk dirs do — the upload pipeline lowercases at upload time). */
export interface CaseRef { caseId: string; dirId: string }
export function caseTitleMap(graph: Graph): Map<string, CaseRef> {
  const map = new Map<string, CaseRef>();
  for (const n of graph.nodes) {
    if (n.type !== "test" || n.kind !== "e2e" || !n.playwrightTitle) continue;
    const dirId = bareOf(n.id);
    map.set(n.playwrightTitle, { caseId: dirId.toLowerCase(), dirId });
  }
  return map;
}

interface PwAttachment { name?: string; path?: string }
interface PwResult { status?: string; attachments?: PwAttachment[] }
interface PwSpec { title: string; tests?: { results?: PwResult[] }[] }
interface PwSuite { title?: string; suites?: PwSuite[]; specs?: PwSpec[] }

/** One screenshot to copy: source path from the report, dest under .step-shots/<dirId>/. */
export interface ResultShot { dirId: string; srcPath: string; destName: string }

const isScreenshot = (a: PwAttachment): boolean =>
  Boolean(a.path) && (String(a.name ?? "").startsWith("screenshot") || String(a.path).toLowerCase().endsWith(".png"));

/**
 * Resolve one result-screenshot per mapped case from the Playwright JSON report. For each spec whose
 * title maps to a case, walk its result attempts and take the screenshot attachment of the LAST
 * attempt that has one (the final/failure frame — a retried failure's last attempt is the state we
 * want to see). Specs with no mapped case (auth setup, unknown titles) are skipped entirely.
 */
export function resolveResultShots(reportJson: string, titles: Map<string, CaseRef>): ResultShot[] {
  const root = JSON.parse(reportJson) as { suites?: PwSuite[] };
  const out: ResultShot[] = [];
  const walk = (s: PwSuite) => {
    for (const spec of s.specs ?? []) {
      const ref = titles.get(spec.title);
      if (!ref) continue;
      const results = spec.tests?.[0]?.results ?? [];
      let srcPath: string | undefined;
      for (const r of results) {
        const shot = (r.attachments ?? []).find(isScreenshot);
        if (shot?.path) srcPath = shot.path; // later attempt overwrites — last shot wins
      }
      if (srcPath) out.push({ dirId: ref.dirId, srcPath, destName: `${ref.dirId}-result.png` });
    }
    for (const child of s.suites ?? []) walk(child);
  };
  for (const s of root.suites ?? []) walk(s);
  return out;
}

// ── CLI entrypoint (real fs + spawn) — thin glue, not unit-tested; the logic above is. ──
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const { readFile, writeFile, mkdir, copyFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { spawn } = await import("node:child_process");
  const { parsePlaywrightJson } = await import("./parsePlaywrightReport");
  const { mergeResults, normalizeResults } = await import("./resultsFile");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const toolDir = join(__dirname, "..");
  const repoRoot = process.env.KG_REPO_ROOT ?? join(toolDir, "..", "..");
  const frontendDir = join(repoRoot, "dojostack_frontend");
  const resultsPath = join(frontendDir, "e2e", "kg-test-results.json");
  const shotsRoot = join(frontendDir, "e2e", ".step-shots");

  const reportArg = process.argv[2];
  const upload = process.argv.includes("--upload");
  if (!reportArg || reportArg.startsWith("--")) {
    console.error("kg record:run — usage: npm run record:run -- <playwright-report.json> [--upload]");
    process.exit(1);
  }

  const reportJson = await readFile(reportArg, "utf8").catch(() => null);
  if (!reportJson) {
    // Resilience: a missing/unreadable report must never fail a test run — just log and stop.
    console.warn(`kg record:run — no readable report at ${reportArg}; nothing recorded`);
    process.exit(0);
  }

  const run = (cmd: string, args: string[], cwd: string) =>
    new Promise<number>((resolve) => {
      const p = spawn(cmd, args, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: "0" }, stdio: "inherit" });
      p.on("close", (code) => resolve(code ?? -1));
      p.on("error", () => resolve(-1));
    });

  const graph = JSON.parse(await readFile(join(toolDir, "knowledge-graph.json"), "utf8")) as Graph;
  const refs = caseTitleMap(graph);
  const titles = new Map([...refs.entries()].map(([t, v]) => [t, v.caseId]));

  // (a) record results — same composition syncResults performs (parse → per-entry commit stamp → merge).
  const parsed = parsePlaywrightJson(reportJson, titles);
  const now = new Date().toISOString();
  const commit = await new Promise<string>((resolve) => {
    const p = spawn("git", ["rev-parse", "--short", "HEAD"], { cwd: frontendDir, shell: true });
    let o = ""; p.stdout?.on("data", (d) => (o += d)); p.on("close", () => resolve(o.trim() || "unknown"));
  });
  const incoming: ResultsFileV2 = {
    generatedAt: now, commit,
    results: Object.fromEntries(Object.entries(parsed).map(([id, r]) => [id, { ...r, at: now, commit }])),
  };
  const existing = await readFile(resultsPath, "utf8").then(normalizeResults).catch(() => null);
  // Any playwright run is a SCOPED update (it may run a subset) — never drop untouched cases.
  const merged = mergeResults(existing, incoming, true);
  await writeFile(resultsPath, JSON.stringify(merged, null, 2) + "\n");
  const fails = Object.values(parsed).filter((r) => r.status === "fail").length;
  console.log(`kg record:run — recorded ${Object.keys(parsed).length} result(s): ${fails} fail → ${resultsPath}`);

  // (b) harvest screenshots — EXACT per-test attachment mapping into .step-shots/<caseId>/<caseId>-result.png.
  const shots = resolveResultShots(reportJson, refs);
  let copied = 0;
  for (const shot of shots) {
    const destDir = join(shotsRoot, shot.dirId);
    try {
      await mkdir(destDir, { recursive: true });
      await copyFile(shot.srcPath, join(destDir, shot.destName));
      copied++;
    } catch (e) {
      console.warn(`kg record:run — could not copy shot for ${shot.dirId}: ${(e as Error).message}`);
    }
  }
  console.log(`kg record:run — harvested ${copied}/${shots.length} result screenshot(s) → ${shotsRoot}`);

  // (d) optional evidence upload (network/slow — opt in only).
  if (upload) {
    const code = await run("npx", ["tsx", "src/shotsUpload.ts"], toolDir);
    if (code !== 0) console.warn(`kg record:run — ⚠ evidence upload failed (exit ${code}); results + local shots still recorded`);
  }

  // (c) rebuild artifacts so the local viewer reflects this run immediately.
  const buildCode = await run("npx", ["tsx", "src/sync.ts"], toolDir);
  if (buildCode !== 0) console.warn(`kg record:run — ⚠ artifact rebuild exited ${buildCode}; results + shots were still recorded`);
  process.exit(0);
}
