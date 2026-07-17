// Pure run scheduler for the KG viewer's multi-test runner.
//
// Splits a batch of e2e cases into a headless concurrency POOL (parallelSafe cases, run up to
// `concurrency` at a time) and a SERIAL list (everything else — mutating/untagged — run one at a
// time so concurrent runs never race the single shared test DB). Input order is preserved within
// each list so the run panel rows appear in a stable, predictable order.
//
// This is the CANONICAL decision. It is unit-tested here and hand-MIRRORED byte-for-byte into the
// viewer.template.html inline JS (see the "Pure logic mirrors src/runSchedule.ts" comment there) —
// the build only inlines JSON, it does not bundle this module into the page.

export interface SchedulableCase { id: string; parallelSafe?: boolean; }
export interface RunPlan { pool: string[]; serial: string[]; concurrency: number; }

export function planRun(cases: SchedulableCase[], concurrency: number): RunPlan {
  const clamped = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  const pool: string[] = [];
  const serial: string[] = [];
  for (const c of cases) {
    if (c.parallelSafe === true) pool.push(c.id);
    else serial.push(c.id);
  }
  return { pool, serial, concurrency: clamped };
}

// Pure argv/env decision for a single /api/run spawn. Mirrors the contract's headless flag:
// headless → drop --headed AND drop the step-pause pacing (fast, unpaced). A headed run still omits
// --headed when a persistent browser is up, because the run ATTACHES to it (already headed).
export interface RunArgsInput {
  spec: string; grepArgs: string[]; retries: string; headless: boolean; hasPersistentBrowser: boolean;
}
export interface RunArgsOutput { args: string[]; dropStepPause: boolean; }
export function buildRunArgs(i: RunArgsInput): RunArgsOutput {
  const args = ["playwright", "test", `e2e/${i.spec}`, ...i.grepArgs, "--workers=1", `--retries=${i.retries}`];
  if (!i.headless && !i.hasPersistentBrowser) args.push("--headed");
  return { args, dropStepPause: i.headless };
}
