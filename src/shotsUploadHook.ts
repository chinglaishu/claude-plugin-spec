// src/shotsUploadHook.ts — pure decision logic for syncResults.ts's end-of-run auto-upload
// hook (spec §5 item 3). Kept separate from syncResults.ts (a thin, largely untested runner
// script per its own header comment) so this piece of real logic is unit-tested.

export interface AutoUploadContext {
  caseCount: number;    // number of cases that just ran
  env: Record<string, string | undefined>;
}

/**
 * Whether syncResults.ts should invoke the evidence auto-upload after recording results:
 * a full batch, or a --case scope covering >=1 case; never when zero cases ran;
 * KG_SHOTS_UPLOAD=0 disables outright.
 */
export function shouldAutoUpload(ctx: AutoUploadContext): boolean {
  if (ctx.env.KG_SHOTS_UPLOAD === "0") return false;
  return ctx.caseCount > 0;
}

/** Build the `--case a,b,c` argument scoped to exactly the case ids just run. */
export function uploadCaseArg(caseIds: string[]): string | undefined {
  return caseIds.length ? caseIds.join(",") : undefined;
}
