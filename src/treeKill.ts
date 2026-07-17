// Kill an entire process tree cross-platform. `proc.kill()` alone only signals
// the immediate child; on Windows a spawned `npx.cmd playwright test ...`
// forks Node test workers which in turn launch a headed Chrome — none of
// those descendants receive the signal, so they leak (audit BUG-3: orphaned
// Chrome/node processes surviving panel close). `taskkill /T /F` kills the
// whole tree rooted at the pid. POSIX gets a plain SIGTERM (Playwright/Node
// process groups clean up their own children on SIGTERM in practice here;
// no detached/setsid process group is created by our spawn calls).
//
// Command construction is split out as a pure function so the exact argv is
// unit-testable without actually spawning/killing a real process.
import { spawnSync } from "node:child_process";

export type TreeKillCommand =
  | { cmd: "taskkill"; args: string[] }
  | { signal: "SIGTERM"; pid: number };

export function treeKillCommand(platform: NodeJS.Platform, pid: number): TreeKillCommand {
  if (platform === "win32") {
    return { cmd: "taskkill", args: ["/pid", String(pid), "/T", "/F"] };
  }
  return { signal: "SIGTERM", pid };
}

// Execute the tree-kill for a real pid. Best-effort: swallow errors (the
// process may have already exited between the disconnect/abort event and
// this call — that's a success, not a failure).
export function treeKill(pid: number, platform: NodeJS.Platform = process.platform): void {
  const command = treeKillCommand(platform, pid);
  try {
    if ("cmd" in command) {
      spawnSync(command.cmd, command.args);
    } else {
      process.kill(command.pid, command.signal);
    }
  } catch {
    /* ignore — already exited, or insufficient permission to signal a dead pid */
  }
}
