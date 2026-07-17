import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, writeFileSync, unlinkSync, watch, mkdtempSync, existsSync, type FSWatcher } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { toggleStarInYaml } from "./toggleStar";
import { acquireLock, releaseLock, type AcquireResult, type LockFs } from "./serveLock";
import { gateDecision } from "./gateDecision";
import { treeKill } from "./treeKill";
import { isWithinRoot } from "./pathGuard";
import { LiveHub } from "./liveHub";
import { orchestratePlan } from "./ensureOrchestrated";
import { resolveBackendVenvPython } from "./resolveBackendVenvPython";
import { resolvePlaywrightUrls } from "./resolvePlaywrightUrls";
import { buildRunArgs } from "./runSchedule";
import { parseCaseResult } from "./parsePlaywrightReport";
import { runArtifactUrl } from "./serveArtifacts";
import { readDecisions, applyDecision, serializeDecisions, decisionsFor, type DecisionStatus } from "./conflictDecisions";
import type { Graph, GraphNode } from "./types";

// Under vitest this module is imported ONLY for its exported route handlers
// (serveRegistry/serveSrc — see serveProvenance.test.ts), so the side-effectful
// boot steps (spawn-lock acquisition + listening on :8971) are skipped: a live
// `kg serve` may already own both, and tests must never contend with it.
const UNDER_TEST = process.env.VITEST !== undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolDir = join(__dirname, "..");
// The canonical graph file every run path rewrites when it rebuilds — the source
// of truth for both /api/graph (served fresh) and the /api/live watch trigger.
const GRAPH_PATH = join(toolDir, "knowledge-graph.json");
const repoRoot = process.env.KG_REPO_ROOT ?? join(toolDir, "..", "..");
const frontendDir = join(repoRoot, "dojostack_frontend");
const backendDir = join(repoRoot, "dojostack_backend");
const FE_PORT = Number(process.env.E2E_FE_PORT ?? 4000);
const BE_PORT = Number(process.env.E2E_BE_PORT ?? 9000);
const FE_URL = `http://127.0.0.1:${FE_PORT}`;
const BE_URL = `http://127.0.0.1:${BE_PORT}`;
const PORT = Number(process.env.KG_PORT ?? 8971);
// Watch pacing (ms the paced helper waits between step actions) + screenshot
// output dir, both forwarded into the spawned Playwright run. Screenshots default
// OUT OF THE REPO (workspace parent) so run evidence never lands in git.
const STEP_PAUSE_MS = process.env.KG_STEP_PAUSE ?? "1500";
// Auto-retry a run once so a flaky login/auth (the dev-server auth setup is
// intermittently flaky) self-heals instead of showing a red run. Tune/disable
// with KG_RETRIES.
const RUN_RETRIES = process.env.KG_RETRIES ?? "1";
const SHOTS_DIR =
  process.env.E2E_SHOTS_DIR ?? join(repoRoot, "..", ".dojostack-e2e-shots");
// Fallback shots root when nothing has been written to SHOTS_DIR yet (e.g. a
// dev never set E2E_SHOTS_DIR and Playwright's own default landed shots under
// the frontend repo instead). Contract 2 (§2): probe both roots.
const SHOTS_DIR_FALLBACK = join(frontendDir, "e2e", ".step-shots");
// Per-run failure-screenshot temp roots (Feature 2a). Each /api/run mints a fresh dir under the
// OS temp so parallel headless batch runs (F1) never clobber each other's JSON report or shots.
// Served read-only via /run-artifacts/<runId>/<file>; NEVER committed. runId -> dir map lets the
// route resolve a URL back to its dir with a pathGuard check.
const RUN_ARTIFACT_DIRS = new Map<string, string>();

// On Windows, `npx` is a `.cmd` shim. Historically these spawns used
// `shell:true` so the shim would resolve at all. But `shell:true` on Windows
// builds the command line by naively joining argv with spaces and handing it
// to `cmd.exe` to re-tokenize, which mangles any argument containing spaces —
// e.g. `-g "redirects /home to /login"` (a Playwright title used as a grep
// filter) becomes several separate words, so `-g` greps for just `redirects`
// and Playwright matches every "redirects ..." test (15) instead of the
// intended 1 (the reproduced defect this fixes).
//
// The fix is NOT simply "pass shell:false" — Node (this version, this
// platform) refuses outright to spawn a bare `.cmd` with `shell:false`
// (`EINVAL`, verified live): Windows never runs `.cmd`/`.bat` files directly,
// only `cmd.exe` does, and `shell:false` means Node itself must exec the
// target, which it can't for a shell-script-shaped file. The correct fix is
// to invoke `cmd.exe /d /s /c npx.cmd <realArgs...>` ourselves with
// `shell:false` — Node's own (non-naive) Windows argv-quoting then quotes
// each argv element correctly for `cmd.exe` to hand to npx unchanged, so a
// title containing spaces survives intact (verified live: argv round-trips
// byte-for-byte through this path, whereas `shell:true` splits it on
// whitespace). POSIX has no such shim/quoting problem, so it spawns `npx`
// directly with `shell:false` as originally intended.
function spawnShim(bin: "npx" | "npm", args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): ChildProcess {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `${bin}.cmd`, ...args], { ...opts, shell: false });
  }
  return spawn(bin, args, { ...opts, shell: false });
}
function spawnNpx(args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): ChildProcess {
  return spawnShim("npx", args, opts);
}

// Whitelist: only cases present in the current graph may be triggered. Loaded
// FRESH from disk on each /api/run, so a rebuild is picked up WITHOUT restarting
// the server (the boot copy below is just for the health probe / startup log).
async function loadRunnable(): Promise<{
  allowedSpecs: Map<string, string>;
  playwrightTitles: Map<string, string>;
}> {
  const graph = JSON.parse(
    await readFile(join(toolDir, "knowledge-graph.json"), "utf8")
  ) as Graph;
  const allowedSpecs = new Map<string, string>();
  const playwrightTitles = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.type === "test" && n.spec && typeof n.spec === "string") {
      allowedSpecs.set(n.id, sanitizeSpec(n.spec, n));
      if (n.playwrightTitle) playwrightTitles.set(n.id, String(n.playwrightTitle));
    }
  }
  return { allowedSpecs, playwrightTitles };
}

// Boot copy — used only for the health probe count and the startup log.
const { allowedSpecs } = await loadRunnable();

function sanitizeSpec(spec: string, n: GraphNode): string {
  // Accept only bare `.spec.ts` filenames, no path separators — prevents traversal via spec field.
  const bare = spec.trim();
  if (!/^[a-zA-Z0-9._-]+\.spec\.ts$/.test(bare)) throw new Error(`case ${n.id}: unsafe spec value ${spec}`);
  return bare;
}

// Escape a literal string for use as a regex (Playwright's -g uses RegExp semantics).
function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ── Spawn lock (prevents two `kg serve` instances double-spawning servers) ──
const realLockFs: LockFs = {
  readFileSync: (p) => readFileSync(p, "utf8"),
  writeFileSync: (p, content, flag) => writeFileSync(p, content, { flag }),
  unlinkSync: (p) => unlinkSync(p),
};
function isPidAlive(pid: number): boolean {
  try {
    // Signal 0 does not actually send a signal — it only tests existence/permission.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
const LOCK_PATH = join(repoRoot, ".kg-serve.lock");
// Never touch the real lock file under vitest (a live serve instance may hold it);
// report "contended with unknown owner" so weOwnTheLock stays false and cleanup()
// never releases a lock we don't own.
const lockResult: AcquireResult = UNDER_TEST
  ? { status: "contended", ownerPid: -1, ownerPort: -1 }
  : acquireLock(LOCK_PATH, { pid: process.pid, port: PORT }, realLockFs, isPidAlive);
const weOwnTheLock = lockResult.status === "acquired";
if (!UNDER_TEST && !weOwnTheLock && lockResult.status === "contended") {
  console.log(
    `kg: attaching to existing managed servers (serve pid ${lockResult.ownerPid} on port ${lockResult.ownerPort} already holds the lock); this instance will not spawn servers`
  );
}

// ── Persistent watch environment (orchestrate-all) ───────────────────────────
// On boot, bring up the FE/BE dev servers + a persistent headed browser ONCE;
// each ▶ Run then ATTACHES (skip flags + connectOptions) so runs don't reload
// servers or relaunch the browser. Every piece is best-effort — on any failure
// we fall back to the prior behaviour (Playwright manages servers; per-run
// --headed launch), so the viewer never regresses.
const managed: ChildProcess[] = [];
let serversReady = false;
// True when we *think* we started the servers but never confirmed health in
// time — historically this silently masqueraded as `serversReady` (the
// `= startedOwn` fallback), so a run would set the Playwright skip flags
// against servers that might not actually be up. The per-run readiness gate
// (below) re-probes on every /api/run regardless of this flag, so that path
// is protected too — but the boot-time log and this flag now say plainly that
// health was never confirmed, rather than silently claiming ready.
let serversUnconfirmed = false;
let browserWs: string | null = null;
let browserProc: ChildProcess | null = null;

// Lazy-orchestrate: boot the persistent FE/BE + headed browser AT MOST ONCE, on the first
// /api/run — never eagerly at serve startup (view-only opens stay light). Memoized: every
// subsequent run awaits the same promise and reuses the servers/browser. KG_ORCHESTRATE=0 opts
// out (returns immediately → Playwright manages per-run servers). Best-effort: ensureServers /
// ensureBrowserServer already swallow failures and fall back, so this never throws.
let orchestratePromise: Promise<void> | null = null;
function ensureOrchestrated(): Promise<void> {
  if (!orchestratePlan({ KG_ORCHESTRATE: process.env.KG_ORCHESTRATE }).enabled) return Promise.resolve();
  if (!orchestratePromise) {
    orchestratePromise = Promise.all([ensureServers(), ensureBrowserServer()])
      .then(() => undefined)
      .catch(() => undefined); // best-effort — fall back to Playwright-managed per-run servers
  }
  return orchestratePromise;
}

function pipeLog(child: ChildProcess, label: string): void {
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(`[${label}] ${d}`));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[${label}] ${d}`));
}

// Ready = a real 2xx from the app, not just "something answered" (Next returns
// 200 for /login only once the route has compiled), so runs never fire against
// a mid-compile / 404 server.
async function probe(url: string): Promise<{ listening: boolean; ok: boolean }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return { listening: true, ok: r.ok };
  } catch {
    return { listening: false, ok: false };
  }
}
async function isUp(url: string): Promise<boolean> {
  return (await probe(url)).ok;
}

// Start FE (:4000) + BE (:9000) if they aren't already up, and wait for health.
// If we start them, we own them (killed on exit) and runs use skip flags so
// Playwright never double-starts on the same ports. Skipped entirely when
// another `kg serve` instance already holds the spawn lock (see above) — we
// attach to whatever it started instead.
async function ensureServers(): Promise<void> {
  if (!weOwnTheLock) {
    // Another instance owns spawning. Just probe so serversReady reflects
    // reality (the per-run gate re-probes anyway, but this makes the boot log
    // honest too).
    serversReady = (await isUp(`${FE_URL}/login`)) && (await isUp(`${BE_URL}/docs`));
    return;
  }

  const feUp = await isUp(`${FE_URL}/login`);
  const beUp = await isUp(`${BE_URL}/docs`);
  if (feUp && beUp) { serversReady = true; return; }

  // Fail-fast wiring: if a spawned FE/BE child dies BEFORE the readiness
  // probe below confirms both up, we don't want the parent to silently sit
  // in the deadline loop for 180 s waiting for a listener that will never
  // come back (the historic behaviour on `Address already in use`, missing
  // venv, missing FE dep, etc.). Attach exit + error handlers that, while
  // the parent is still in the "waiting for ready" phase, tear the whole
  // process group down and exit non-zero with a clear message.
  let serversConfirmed = false;
  const failFast = (label: "backend" | "frontend", reason: string): void => {
    if (serversConfirmed) return; // post-ready deaths are the caller's problem
    process.stderr.write(
      `[serve] FATAL: ${label} exited before becoming ready (${reason}). ` +
        `Killing all managed processes.\n`
    );
    try { cleanup(); } catch { /* best-effort */ }
    process.exit(1);
  };
  const wireFailFast = (child: ChildProcess, label: "backend" | "frontend"): void => {
    child.once("exit", (code, signal) => {
      failFast(label, signal ? `signal ${signal}` : `code ${code}`);
    });
    child.once("error", (err) => {
      failFast(label, `spawn error: ${err.message}`);
    });
  };

  if (!beUp) {
    const py = resolveBackendVenvPython(repoRoot, backendDir, process.platform, existsSync, join);
    const be = spawn(py, ["-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", String(BE_PORT)], {
      cwd: backendDir,
      env: { ...process.env, ALLOWED_ORIGINS: FE_URL, DISABLE_MODEL_SOURCE_CHECK: "True" },
    });
    managed.push(be); pipeLog(be, "backend"); wireFailFast(be, "backend");
  }
  if (!feUp) {
    const fe = spawnShim("npm", ["run", "dev", "--", "--port", String(FE_PORT)], {
      cwd: frontendDir,
      env: { ...process.env, NEXT_PUBLIC_API_URL: `${BE_URL}/api/v1/`, NEXT_PUBLIC_E2E_BYPASS_PROJECTION_SAVE_BLOCKER: "1" },
    });
    managed.push(fe); pipeLog(fe, "frontend"); wireFailFast(fe, "frontend");
  }

  const startedOwn = managed.length > 0;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    if ((await isUp(`${FE_URL}/login`)) && (await isUp(`${BE_URL}/docs`))) {
      serversReady = true;
      serversConfirmed = true; // stop turning post-ready deaths into hard exits
      return;
    }
  }
  // Didn't confirm in time. Previously this silently claimed `serversReady =
  // startedOwn`, which meant a run would set skip flags against servers whose
  // health was never proven. Runs still need the skip flags IF we started the
  // processes (Playwright must not double-start on the same ports — that
  // would compound the problem), but we no longer call this "ready": the
  // per-run gate (gateDecision) re-probes before every run and will catch a
  // still-wedged listener and report serverNotReady rather than proceeding.
  serversReady = false;
  serversUnconfirmed = startedOwn;
}

// Launch the long-lived headed browser server; capture its ws endpoint.
async function ensureBrowserServer(): Promise<void> {
  if (!weOwnTheLock) return; // another instance manages the persistent browser
  await new Promise<void>((resolve) => {
    const p = spawnNpx(["tsx", "e2e/_helpers/browserServer.mts"], { cwd: frontendDir, env: process.env });
    browserProc = p;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    p.stdout?.on("data", (d: Buffer) => {
      const m = d.toString().match(/KG_BROWSER_WS=(\S+)/);
      if (m) { browserWs = m[1]; finish(); }
    });
    p.stderr?.on("data", (d: Buffer) => process.stderr.write(`[browser] ${d}`));
    p.on("close", () => { browserWs = null; });
    p.on("error", () => finish());
    setTimeout(finish, 30_000); // fall back to per-run --headed if it never reports
  });
}

function cleanup(): void {
  // Tree-kill every managed child (FE/BE dev servers, the persistent browser
  // server) — a plain `.kill()` only signals the immediate child and leaks
  // Playwright/Chrome descendants on Windows (the same BUG-3 leak this fixes
  // for a single run's child, applied here to server-shutdown-managed ones).
  try { if (browserProc?.pid) treeKill(browserProc.pid); else browserProc?.kill(); } catch { /* ignore */ }
  for (const c of managed) { try { if (c.pid) treeKill(c.pid); else c.kill(); } catch { /* ignore */ } }
  try { graphWatcher?.close(); } catch { /* ignore */ }
  graphWatcher = null;
  liveHub.dispose();
  if (weOwnTheLock) releaseLock(LOCK_PATH, process.pid, realLockFs);
}
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

// KG_READY_TIMEOUT env override (ms) for the pre-run readiness gate, default 60s.
const READY_TIMEOUT_MS = Number(process.env.KG_READY_TIMEOUT ?? 60_000);
const READY_POLL_MS = 2_000;

// Pre-run readiness gate — runs before EVERY /api/run (not just once at boot),
// so it protects both the "we started servers but never confirmed" path and
// the plain default path (Playwright manages servers, nothing persistent).
// Emits `status` SSE events (contract 1) while waiting; on give-up emits
// `serverNotReady` + the caller sends `exit {code:-2}` and spawns nothing.
// Returns true if the caller may proceed to spawn Playwright.
async function runReadinessGate(send: (event: string, data: unknown) => void): Promise<boolean> {
  const start = Date.now();
  send("status", { phase: "checking-servers", detail: "probing frontend + backend health", elapsedMs: 0 });
  for (;;) {
    const waitedMs = Date.now() - start;
    const [fe, be] = await Promise.all([probe(`${FE_URL}/login`), probe(`${BE_URL}/docs`)]);
    const decision = gateDecision(fe.listening, fe.ok, be.listening, be.ok, waitedMs, READY_TIMEOUT_MS);

    if (decision === "proceed") {
      if (!fe.listening && !be.listening) {
        send("status", { phase: "starting", detail: "no server listening yet — Playwright will start its own", elapsedMs: waitedMs });
      }
      return true;
    }

    if (decision === "serverNotReady") {
      const target = !fe.ok ? "frontend" : "backend";
      const url = target === "frontend" ? FE_URL : BE_URL;
      send("serverNotReady", { target, url, waitedMs });
      return false;
    }

    // "wait": at least one side is a listening-but-unhealthy (wedged/compiling)
    // server; keep polling until healthy or until the timeout above fires.
    const wedgedTarget = fe.listening && !fe.ok ? "frontend" : "backend";
    const wedgedPort = wedgedTarget === "frontend" ? FE_PORT : BE_PORT;
    send("status", {
      phase: "waiting-server",
      detail: `${wedgedTarget} on :${wedgedPort} responding but not healthy (compiling?) — waiting ${Math.round(waitedMs / 1000)}s/${Math.round(READY_TIMEOUT_MS / 1000)}s`,
      elapsedMs: waitedMs,
    });
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
}

// Serve a screenshot PNG from the shots dir(s) for contract-2 `/shots/<caseBareId>/<filename>`.
// Path-traversal-safe: normalize + prefix-check against BOTH candidate roots
// (same idiom as the existing static-file serving below), trying the primary
// dir first and falling back to the secondary. 404 if absent from both, or if
// either component of the path attempts to escape its root.
async function serveShot(pathname: string, res: import("node:http").ServerResponse, cors: Record<string, string>): Promise<void> {
  const rest = pathname.slice("/shots/".length); // "<caseBareId>/<filename>"
  const roots = [SHOTS_DIR, SHOTS_DIR_FALLBACK];
  for (const root of roots) {
    const normalizedRoot = normalize(root);
    const abs = normalize(join(normalizedRoot, rest));
    if (!isWithinRoot(normalizedRoot, abs)) continue; // traversal attempt — try next root, then 404
    try {
      const content = await readFile(abs);
      res.writeHead(200, { "Content-Type": "image/png", ...cors }).end(content);
      return;
    } catch {
      continue;
    }
  }
  res.writeHead(404, cors).end("not found");
}

// GET /run-artifacts/<runId>/<file> — read-only failure screenshots for a LIVE run (Feature 2a).
// Same path-traversal contract as serveShot: resolve <file> under the per-run temp dir and
// isWithinRoot-check before reading. Unknown runId or traversal attempt -> 404. (Distinct from
// /shots/<caseBareId>/<file>, which serves AUTHORED step screenshots.) `dirs` is injectable for
// tests only; production passes the module-level RUN_ARTIFACT_DIRS registry.
export async function serveRunArtifact(
  pathname: string,
  res: import("node:http").ServerResponse,
  cors: Record<string, string>,
  dirs: Map<string, string> = RUN_ARTIFACT_DIRS
): Promise<void> {
  const rest = pathname.slice("/run-artifacts/".length); // "<runId>/<file>"
  const slash = rest.indexOf("/");
  if (slash < 0) return void res.writeHead(404, cors).end("not found");
  let runId: string; let file: string;
  try {
    runId = decodeURIComponent(rest.slice(0, slash));
    file = decodeURIComponent(rest.slice(slash + 1));
  } catch {
    return void res.writeHead(404, cors).end("not found"); // malformed percent-encoding
  }
  const dir = dirs.get(runId);
  if (!dir) return void res.writeHead(404, cors).end("not found");
  const root = normalize(dir);
  const abs = normalize(join(root, file));
  if (!isWithinRoot(root, abs)) return void res.writeHead(404, cors).end("not found"); // traversal
  try {
    const content = await readFile(abs);
    res.writeHead(200, { "Content-Type": "image/png", ...cors }).end(content);
  } catch {
    res.writeHead(404, cors).end("not found");
  }
}

// ── Read-only provenance routes (viewer "open the source" links) ─────────────
// Frozen contract with the viewer template (design 1a/1b.1):
//   GET /registry/<basename>      → the raw *.features.yaml registry file
//   GET /src/<repo-relative-path> → a raw source file from one of the three repos
// Both: 200 `text/plain; charset=utf-8` with the same CORS header as /shots/,
// anything invalid/missing → 404 plain "not found". Read-only, no listings.

type NotFoundRes = import("node:http").ServerResponse;
function notFound(res: NotFoundRes, cors: Record<string, string>): void {
  res.writeHead(404, cors).end("not found");
}

const FEATURES_DIR = join(frontendDir, "e2e", "features");
// Extensions the /src/ route may serve — source/spec/doc text formats only.
const SRC_EXTENSIONS = new Set([".ts", ".tsx", ".py", ".md", ".yaml", ".yml", ".json", ".sql"]);

// GET /registry/<basename> — basename-only (any separator or `..`, raw or
// URL-encoded, is rejected AFTER decoding), must end `.features.yaml`, and the
// resolved path must stay inside the features dir (isWithinRoot, same idiom as
// /shots/). `featuresDir` is injectable for tests only.
export async function serveRegistry(
  pathname: string,
  res: import("node:http").ServerResponse,
  cors: Record<string, string>,
  featuresDir: string = FEATURES_DIR
): Promise<void> {
  let base: string;
  try {
    base = decodeURIComponent(pathname.slice("/registry/".length));
  } catch {
    return notFound(res, cors); // malformed percent-encoding
  }
  if (!base || base.includes("/") || base.includes("\\") || base.includes("..")) return notFound(res, cors);
  if (!base.endsWith(".features.yaml") || base === ".features.yaml") return notFound(res, cors);
  const root = normalize(featuresDir);
  const abs = normalize(join(root, base));
  if (!isWithinRoot(root, abs) || abs === root) return notFound(res, cors);
  try {
    const content = await readFile(abs, "utf8");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors }).end(content);
  } catch {
    return notFound(res, cors);
  }
}

// GET /src/<repo-relative-path> — path is repo-relative from the WORKSPACE
// layout the graph uses: `dojostack_frontend/...` / `dojostack_backend/...`
// resolve inside those nested repos, anything else resolves inside the main
// repo. Guards, in order: decode once; no backslashes; no empty / dot-prefixed
// (`.env`, `.git`, `.`, `..`) / drive-letter (`:`) segments; extension
// allowlist; isWithinRoot against the CHOSEN repo root. `roots` is injectable
// for tests only.
export async function serveSrc(
  pathname: string,
  res: import("node:http").ServerResponse,
  cors: Record<string, string>,
  roots: { main: string; frontend: string; backend: string } = { main: repoRoot, frontend: frontendDir, backend: backendDir }
): Promise<void> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice("/src/".length));
  } catch {
    return notFound(res, cors); // malformed percent-encoding
  }
  if (!rel || rel.includes("\\")) return notFound(res, cors);
  const segments = rel.split("/");
  if (segments.some((s) => s === "" || s.startsWith(".") || s.includes(":"))) return notFound(res, cors);
  // `.local.` infix = the repo's credentials-stay-local convention (e.g. the
  // gitignored e2e.accounts.local.json holding the shared E2E password) —
  // refuse by name rather than relying on gitignore status. [CC6.1]
  if (segments.some((s) => s.toLowerCase().includes(".local."))) return notFound(res, cors);
  const file = segments[segments.length - 1];
  const dot = file.lastIndexOf(".");
  const ext = dot > 0 ? file.slice(dot).toLowerCase() : "";
  if (!SRC_EXTENSIONS.has(ext)) return notFound(res, cors);
  let root: string;
  let sub: string[];
  if (segments[0] === "dojostack_frontend") { root = roots.frontend; sub = segments.slice(1); }
  else if (segments[0] === "dojostack_backend") { root = roots.backend; sub = segments.slice(1); }
  else { root = roots.main; sub = segments; }
  if (sub.length === 0) return notFound(res, cors);
  const nroot = normalize(root);
  const abs = normalize(join(nroot, ...sub));
  if (!isWithinRoot(nroot, abs) || abs === nroot) return notFound(res, cors);
  try {
    const content = await readFile(abs, "utf8");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors }).end(content);
  } catch {
    return notFound(res, cors);
  }
}

// ── Live auto-refresh hub + file watcher ─────────────────────────────────────
// One hub per serve process holds the connected /api/live SSE clients and owns
// the debounce/keepalive/broadcast logic (unit-tested in liveHub.test.ts). The
// fs.watch glue below is thin+untested (like the other serve glue): it turns raw
// file-change events on knowledge-graph.json into hub.notify() calls, which the
// hub coalesces into one push. Never armed under vitest (no side effects on import).
const liveHub = new LiveHub();
let graphWatcher: FSWatcher | null = null;
function armGraphWatcher(): void {
  if (graphWatcher) return;
  try {
    // Watch the file directly. A rebuild rewrites it (sometimes via a rename/replace),
    // which on some platforms ends the watch — so re-arm on error/close. The debounce
    // in the hub coalesces the burst of events a single rewrite emits.
    graphWatcher = watch(GRAPH_PATH, () => liveHub.notify());
    graphWatcher.on("error", () => { try { graphWatcher?.close(); } catch { /* ignore */ } graphWatcher = null; setTimeout(armGraphWatcher, 500); });
  } catch {
    graphWatcher = null;
  }
}

// GET /api/graph — the current knowledge-graph.json, read FRESH from disk on
// every request, as application/json with the same CORS header as the other
// routes. This is what the viewer re-fetches when /api/live tells it the graph
// was rebuilt. `graphPath` is injectable for tests only; production passes the
// canonical tools/knowledge-graph.json path.
export async function serveGraph(
  res: import("node:http").ServerResponse,
  cors: Record<string, string>,
  graphPath: string = GRAPH_PATH
): Promise<void> {
  try {
    const content = await readFile(graphPath);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors }).end(content);
  } catch {
    res.writeHead(404, cors).end("not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1/");
  const cors = { "Access-Control-Allow-Origin": "http://127.0.0.1:" + PORT };

  // Health probe — the viewer calls this to decide whether to show ▶ Run buttons.
  if (req.method === "GET" && url.pathname === "/api/health") {
    return res.writeHead(200, { "Content-Type": "application/json", ...cors }).end('{"ok":true,"cases":' + allowedSpecs.size + "}");
  }

  // Run-mode probe — the F1 run-mode indicator reads this once at load to show
  // "reusing servers" (KG_ORCHESTRATE enabled) vs "per-run servers" (KG_ORCHESTRATE=0).
  // Read-only; reflects the policy flag, same source ensureOrchestrated() checks lazily.
  if (req.method === "GET" && url.pathname === "/api/run-mode") {
    const reuse = orchestratePlan({ KG_ORCHESTRATE: process.env.KG_ORCHESTRATE }).enabled;
    return res.writeHead(200, { "Content-Type": "application/json", ...cors }).end(JSON.stringify({ reuse }));
  }

  // Current graph JSON, fresh from disk — the viewer re-fetches this on a live update.
  if (req.method === "GET" && url.pathname === "/api/graph") {
    return serveGraph(res, cors);
  }

  // Live auto-refresh stream: a persistent SSE connection. The LiveHub pushes a
  // `graph-updated` event (debounced) whenever knowledge-graph.json is rewritten
  // by any run path's rebuild; the viewer then re-fetches /api/graph and
  // re-renders in place. res.on("close") — the reliable client-disconnect signal
  // (see the BUG-3 note on /api/run) — evicts the client from the hub.
  if (req.method === "GET" && url.pathname === "/api/live") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...cors,
    });
    const off = liveHub.subscribe(res);
    res.on("close", off);
    return;
  }

  // Contract 2 — local screenshot strip. GET only, path-traversal-safe.
  if (req.method === "GET" && url.pathname.startsWith("/shots/")) {
    return serveShot(url.pathname, res, cors);
  }

  // Read-only failure screenshots for a live run (Feature 2a). GET only, path-traversal-safe.
  if (req.method === "GET" && url.pathname.startsWith("/run-artifacts/")) {
    return serveRunArtifact(url.pathname, res, cors);
  }

  // Provenance links (viewer → source). GET only, read-only, path-traversal-safe.
  if (req.method === "GET" && url.pathname.startsWith("/registry/")) {
    return serveRegistry(url.pathname, res, cors);
  }
  if (req.method === "GET" && url.pathname.startsWith("/src/")) {
    return serveSrc(url.pathname, res, cors);
  }

  // Run a single case — streams stdout/stderr back as Server-Sent Events until Playwright exits.
  if (req.method === "POST" && url.pathname === "/api/run") {
    let body = ""; req.on("data", (c) => (body += c));
    await new Promise<void>((r) => req.on("end", () => r()));
    let caseId: string; let headless = false;
    try { const parsed = JSON.parse(body); caseId = String(parsed.caseId ?? ""); headless = parsed.headless === true; } catch { return res.writeHead(400).end("bad body"); }
    // Reload the whitelist from disk so a rebuilt graph is runnable immediately.
    const { allowedSpecs: runnable, playwrightTitles } = await loadRunnable();
    const spec = runnable.get(caseId);
    if (!spec) return res.writeHead(404).end(`unknown case: ${caseId}`);

    // Lazy-orchestrate: on the FIRST run of the session, boot the persistent servers + browser once
    // (default on; KG_ORCHESTRATE=0 skips). Memoized, so later runs return immediately and reuse them.
    await ensureOrchestrated();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...cors,
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const title = playwrightTitles.get(caseId);
    // Run-mode for the F1 indicator: true once this run reuses the persistent FE/BE + browser
    // (post-ensureOrchestrated, so it reflects reality — including the KG_ORCHESTRATE=0/boot-failure
    // fallback — rather than just echoing the policy flag).
    send("start", {
      caseId,
      spec,
      cwd: frontendDir,
      playwrightTitle: title ?? null,
      stepPauseMs: Number(STEP_PAUSE_MS),
      shotsDir: SHOTS_DIR,
      orchestrated: serversReady && !!browserWs,
    });

    // Per-run temp dir for the JSON report + failure screenshots (Feature 2a). Unique per run so
    // parallel headless batch runs (F1) never collide. Registered so /run-artifacts can serve it,
    // torn down on process close. runId is opaque + URL-safe.
    const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const runDir = mkdtempSync(join(tmpdir(), "kg-run-"));
    RUN_ARTIFACT_DIRS.set(runId, runDir);
    const reportPath = join(runDir, "report.json");

    // Readiness gate: re-probe FE/BE on EVERY run (not just once at boot) so a
    // server that wedges/dies after boot is caught before we waste a run on
    // it. On failure: emit serverNotReady + exit -2, spawn NOTHING.
    // Listen on `res` (the ServerResponse), NOT `req` (the IncomingMessage), for client-disconnect
    // detection. Bug found live during integration verification: by this point the request body
    // has already been fully consumed (the `req.on("data")`/`await ... req.on("end")` above), and
    // once an IncomingMessage has emitted its own "end", Node does not reliably re-emit "close" on
    // it when the underlying socket is later torn down mid-response — reproduced in isolation with
    // a minimal http server (client destroys its connection mid-SSE-stream: `res.on("close")` and
    // the raw `socket.on("close")` both fire; `req.on("close")` never does). `res.on("close")` is
    // the documented, reliable signal for "the response was terminated, including because the
    // underlying connection was closed" — this was silently leaking the whole Playwright/Chrome
    // process tree on every panel-close/mid-run disconnect (audit BUG-3 regression).
    let clientDisconnected = false;
    res.on("close", () => { clientDisconnected = true; });
    const ready = await runReadinessGate(send);
    if (!ready) {
      send("exit", { code: -2 });
      res.end();
      RUN_ARTIFACT_DIRS.delete(runId); // no spawn ever happened — drop the unused temp-dir registration
      return;
    }
    if (clientDisconnected) { res.end(); RUN_ARTIFACT_DIRS.delete(runId); return; } // client left during the gate wait

    // --headed opens a visible Chrome; --workers=1 keeps output linear.
    // The frontend's playwright.config.ts drives auth.setup + auto-starts servers.
    // KG_E2E_TARGET lets a developer point runs at their own local test account (e.g. ownerKappa)
    // without editing the shared playwright/e2e.targets.json defaultTarget.
    const e2eTarget = process.env.KG_E2E_TARGET ?? process.env.E2E_TARGET;
    // If the case pins a playwrightTitle, narrow the run to just that one test via -g (regex).
    // Passed as a single argv element (never shell-joined) so a title containing
    // spaces/quotes reaches Playwright verbatim — see the spawnShim/shell:false note above.
    const grepArgs = title ? ["-g", escapeRegex(title)] : [];
    // When a persistent browser server is up, runs ATTACH via connectOptions
    // (it's already headed) so we omit --headed; otherwise launch headed per run.
    // E2E_HEADED=1 keeps the maximized viewport in both modes.
    const { args: runArgsBase, dropStepPause } = buildRunArgs({ spec, grepArgs, retries: RUN_RETRIES, headless, hasPersistentBrowser: !!browserWs });
    // Feature 2a: force the JSON reporter (appended here, not inside buildRunArgs, so F1's
    // scheduler module + its committed argv-shape tests stay untouched). PLAYWRIGHT_JSON_OUTPUT_NAME
    // below redirects that report to this run's own temp file.
    const runArgs = [...runArgsBase, "--reporter=json"];
    const proc = spawnNpx(runArgs, {
      cwd: frontendDir,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        // ⚡ Run (headless) must NOT open a visible browser. The frontend config computes
        // `headed = --headed || E2E_HEADED==="1"`, so a headless run has to send "0" here —
        // otherwise E2E_HEADED=1 forces a headed window even without --headed. Watch stays "1".
        E2E_HEADED: headless ? "0" : "1",
        ...(dropStepPause ? {} : { E2E_STEP_PAUSE: STEP_PAUSE_MS }),
        // Feature 2a: land failure screenshots in this run's own temp dir (NOT the shared
        // SHOTS_DIR) so /run-artifacts can serve them and parallel headless batch runs (F1) never
        // clobber each other's shots. The authored-step /shots/ route is unaffected — it always
        // reads the committed SHOTS_DIR directly, never this run-scoped env var.
        E2E_SHOTS_DIR: runDir,
        // Persistent servers → don't let Playwright start/stop them (no reload).
        ...(serversReady ? { E2E_SKIP_FRONTEND: "1", E2E_SKIP_BACKEND: "1" } : {}),
        // Playwright reads E2E_BASE_URL/E2E_BACKEND_URL independently of this
        // process's FE_PORT/BE_PORT — derive them so a custom E2E_FE_PORT/E2E_BE_PORT
        // (e.g. pointing at an already-running dev server) actually reaches the
        // browser too, not just this readiness gate. See resolvePlaywrightUrls.ts.
        ...resolvePlaywrightUrls(FE_URL, BE_URL, process.env),
        // Persistent browser → attach instead of relaunching — but ONLY for a headed (Watch) run.
        // The persistent browser is HEADED, so a headless ⚡ Run must NOT attach to it (that would
        // pop a window); it launches its own headless browser instead (servers are still reused).
        ...(browserWs && !headless ? { KG_BROWSER_WS: browserWs } : {}),
        ...(e2eTarget ? { E2E_TARGET: e2eTarget } : {}),
        // Feature 2a: write the JSON report to this run's temp file, parsed after exit for the
        // `result` SSE.
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      },
    });
    // Guards the disconnect-triggered tree-kill below: res.end() (normal completion, both the
    // success and spawn-error paths) itself causes Node to emit "close" on `res` — without this
    // flag that fires a wasteful taskkill/SIGTERM against a PID that has already exited (plus a
    // theoretical PID-reuse race on a long-idle event loop). Only a genuine disconnect BEFORE the
    // process finished should tree-kill.
    let exited = false;
    proc.stdout?.on("data", (d: Buffer) => send("log", { stream: "stdout", text: d.toString() }));
    proc.stderr?.on("data", (d: Buffer) => send("log", { stream: "stderr", text: d.toString() }));
    proc.on("error", (err) => { exited = true; send("log", { stream: "stderr", text: `spawn error: ${err.message}\n` }); send("exit", { code: -1 }); res.end(); RUN_ARTIFACT_DIRS.delete(runId); });
    proc.on("close", async (code) => {
      exited = true;
      // Feature 2a: parse this run's JSON report -> structured `result` (status + cleaned error +
      // failure screenshots), rewrite each shot path to a /run-artifacts URL the viewer can load.
      // Best-effort: any parse/read failure still emits exit so the panel terminates cleanly.
      try {
        const reportJson = await readFile(reportPath, "utf8");
        const parsed = parseCaseResult(reportJson, title ?? "");
        const screenshots = parsed.screenshots.map((s) => ({ name: s.name, path: runArtifactUrl(runId, s.path) }));
        send("result", { status: parsed.status, error: parsed.error, screenshots });
      } catch { /* no report (spawn failed / never wrote) → skip result, still send exit */ }
      send("exit", { code });
      res.end();
      // Drop the runId->dir registration shortly after so the viewer's <img> requests still resolve
      // (fired right after `result`); the temp dir is left for the OS temp cleaner (small, PNG-only).
      setTimeout(() => RUN_ARTIFACT_DIRS.delete(runId), 60_000);
    });
    // Tree-kill (not proc.kill()) on client disconnect — proc.kill() alone
    // leaves the Playwright-forked Node workers + headed Chrome running on
    // Windows (audit BUG-3: orphaned processes surviving panel close). Listens on `res`, not
    // `req` — see the res.on("close") comment near the readiness-gate check above.
    res.on("close", () => { if (!exited && !proc.killed && proc.pid) treeKill(proc.pid); });
    return;
  }

  // Toggle a feature's ★ favourite flag by writing `star: true` back into its
  // *.features.yaml, then rebuilding the graph. Keeps the YAML as the single
  // source of truth (design §12) — the viewer just automates the hand-edit.
  // Serve-mode only; the static viewer.html has no server so the ★ stays read-only.
  if (req.method === "POST" && url.pathname === "/api/star") {
    let body = ""; req.on("data", (c) => (body += c));
    await new Promise<void>((r) => req.on("end", () => r()));
    let featureId: string, star: boolean;
    try {
      const parsed = JSON.parse(body);
      featureId = String(parsed.featureId ?? "");
      star = parsed.star === true;
      if (!featureId) throw new Error("missing featureId");
    } catch { return res.writeHead(400, cors).end("bad body"); }

    // Resolve the feature from the current graph — the path comes from OUR generated
    // graph, never the client, so there is no path-traversal surface.
    const graph = JSON.parse(await readFile(join(toolDir, "knowledge-graph.json"), "utf8")) as Graph;
    const node = graph.nodes.find((n) => n.id === featureId && n.type === "feature");
    if (!node || !node.path) return res.writeHead(404, cors).end("unknown feature");
    const abs = normalize(join(repoRoot, node.path));
    if (!isWithinRoot(normalize(repoRoot), abs)) return res.writeHead(400, cors).end("bad path");
    const bareId = featureId.includes(":") ? featureId.slice(featureId.indexOf(":") + 1) : featureId;

    try {
      const yaml = await readFile(abs, "utf8");
      const next = toggleStarInYaml(yaml, bareId, star);
      if (next !== yaml) await writeFile(abs, next);
    } catch (e) {
      return res.writeHead(500, cors).end(`star write failed: ${(e as Error).message}`);
    }

    // Rebuild via the canonical build so json/viewer/report/baseline stay consistent
    // (and the freshness gate keeps passing). Respond only once the rebuild exits 0.
    const build = spawnNpx(["tsx", "src/build.ts"], { cwd: toolDir, env: { ...process.env, FORCE_COLOR: "0" } });
    let buildErr = "";
    build.stderr?.on("data", (d: Buffer) => (buildErr += d.toString()));
    build.on("close", (code) => {
      if (code === 0) res.writeHead(200, { "Content-Type": "application/json", ...cors }).end(JSON.stringify({ ok: true, featureId, star }));
      else res.writeHead(500, cors).end(`rebuild failed (exit ${code}): ${buildErr.slice(-500)}`);
    });
    build.on("error", (err) => res.writeHead(500, cors).end(`rebuild spawn error: ${err.message}`));
    return;
  }

  // Conflict triage decisions (dismiss / resolve). A runtime overlay in conflicts/decisions.json —
  // NOT folded into the deterministic graph (so `check` stays byte-honest), so no rebuild is needed.
  // Serve-mode only; the static viewer.html shows findings read-only without a server.
  const decisionsPath = join(toolDir, "conflicts", "decisions.json");
  if (req.method === "GET" && url.pathname === "/api/conflict-decisions") {
    const graph = JSON.parse(await readFile(join(toolDir, "knowledge-graph.json"), "utf8").catch(() => "{}")) as Graph;
    const decisions = readDecisions(await readFile(decisionsPath, "utf8").catch(() => null));
    // Effective status per CURRENT finding (open by default; decisions for gone findings pruned).
    return res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors })
      .end(JSON.stringify(decisionsFor(graph.conflicts ?? [], decisions)));
  }
  if (req.method === "POST" && url.pathname === "/api/conflict-decision") {
    let body = ""; req.on("data", (c) => (body += c));
    await new Promise<void>((r) => req.on("end", () => r()));
    let findingId: string, status: DecisionStatus, positionId: string | undefined, note: string | undefined;
    try {
      const parsed = JSON.parse(body);
      findingId = String(parsed.findingId ?? "");
      status = String(parsed.status ?? "") as DecisionStatus;
      positionId = parsed.positionId ? String(parsed.positionId) : undefined;
      note = parsed.note ? String(parsed.note) : undefined;
      if (!findingId || !["open", "dismissed", "resolved"].includes(status)) throw new Error("bad");
    } catch { return res.writeHead(400, cors).end("bad body"); }
    try {
      const current = readDecisions(await readFile(decisionsPath, "utf8").catch(() => null));
      const next = applyDecision(current, findingId, { status, positionId, note, at: new Date().toISOString() });
      await mkdir(dirname(decisionsPath), { recursive: true });
      await writeFile(decisionsPath, serializeDecisions(next));
      return res.writeHead(200, { "Content-Type": "application/json", ...cors }).end(JSON.stringify({ ok: true, findingId, status }));
    } catch (e) {
      return res.writeHead(500, cors).end(`decision write failed: ${(e as Error).message}`);
    }
  }

  // Static files: viewer.html + knowledge-graph.json (and viewer.html at / for convenience).
  const rawPath = url.pathname === "/" ? "/viewer.html" : url.pathname;
  // Normalize + reject any path that escapes toolDir.
  const abs = normalize(join(toolDir, rawPath));
  if (!isWithinRoot(toolDir, abs)) return res.writeHead(400).end("bad path");
  try {
    const content = await readFile(abs);
    const type = abs.endsWith(".json") ? "application/json" : abs.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
    return res.writeHead(200, { "Content-Type": type, ...cors }).end(content);
  } catch {
    return res.writeHead(404).end("not found");
  }
});

if (!UNDER_TEST) server.listen(PORT, "127.0.0.1", async () => {
  console.log(`kg: serving http://127.0.0.1:${PORT}/`);
  console.log(`kg: ${allowedSpecs.size} runnable cases (whitelisted from knowledge-graph.json)`);
  // Live auto-refresh: watch the graph file so an OPEN viewer tab updates the
  // moment any run path rebuilds it (viewer subscribes to /api/live, re-fetches
  // /api/graph on graph-updated). Independent of who owns the spawn lock.
  armGraphWatcher();
  console.log(`kg: live auto-refresh armed — open viewers update on rebuild (/api/live + /api/graph)`);
  if (!weOwnTheLock) {
    console.log(`kg: spawn lock held by another serve instance — this instance will only attach, never spawn`);
  }
  if (orchestratePlan({ KG_ORCHESTRATE: process.env.KG_ORCHESTRATE }).enabled) {
    // Lazy: nothing boots now — the first ▶ Run brings up persistent servers + browser once,
    // then every later run reuses them. KG_ORCHESTRATE=0 restores per-run start/stop.
    console.log(`kg: server reuse ENABLED (lazy) — first ▶ Run boots persistent FE/BE + browser once; set KG_ORCHESTRATE=0 to opt out`);
  } else {
    console.log(`kg: server reuse DISABLED (KG_ORCHESTRATE=0) — Playwright manages servers + browser per run`);
  }
  console.log(`kg: ▶ Run is paced (${STEP_PAUSE_MS}ms/step), maximized headed; screenshots → ${SHOTS_DIR}`);
  console.log(`kg: readiness gate timeout ${READY_TIMEOUT_MS}ms (KG_READY_TIMEOUT to override)`);
  // Opt-in eager boot: KG_EAGER_SERVERS=1 spawns FE/BE immediately (e.g. onto
  // E2E_FE_PORT/E2E_BE_PORT) instead of waiting for the first ▶ Run — for the
  // "kg owns my dev servers" workflow, where :3000/:8001 should just be up the
  // moment `serve:watch` starts. Default off: view-only dashboard opens stay
  // light (nothing boots) unless explicitly requested. Browser server is NOT
  // eagerly started here — it's only useful for a headed Watch run.
  if (process.env.KG_EAGER_SERVERS === "1") {
    console.log(`kg: KG_EAGER_SERVERS=1 — booting FE/BE now instead of waiting for the first ▶ Run`);
    ensureServers().catch(() => undefined);
  }
});
