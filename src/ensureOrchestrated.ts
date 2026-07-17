// Lazy-orchestrate policy for serve.ts. Extracted so the enable/skip decision is unit-testable
// WITHOUT booting servers (contract: mock the spawn/probe layer; never boot real servers in tests).
//
// Default ON: view-only opens stay light (nothing boots until the first /api/run), then the batch
// reuses one FE/BE + browser set. Opt out with KG_ORCHESTRATE=0 to restore per-run start/stop.

export interface OrchestratePlan { enabled: boolean; }

export function orchestratePlan(env: { KG_ORCHESTRATE?: string }): OrchestratePlan {
  return { enabled: env.KG_ORCHESTRATE !== "0" };
}
