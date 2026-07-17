/** Public URL for a run screenshot, served by GET /run-artifacts/<runId>/<basename>.
 *  Only the basename is exposed (the on-disk absolute path never reaches the client);
 *  serveRunArtifact resolves it back under the per-run temp dir with a pathGuard check. */
export function runArtifactUrl(runId: string, reportPath: string): string {
  const base = reportPath.split(/[\\/]/).pop() ?? "screenshot.png";
  return `/run-artifacts/${encodeURIComponent(runId)}/${encodeURIComponent(base)}`;
}
