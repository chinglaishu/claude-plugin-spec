// covers: REQ-KG-RUN-04
import { describe, it, expect } from "vitest";
import { treeKillCommand } from "./treeKill";

// Pure command-construction logic for killing a whole process tree (a spawned
// `npx playwright test` child that itself forks Node workers + a headed
// Chrome). On Windows, `proc.kill()` only kills the immediate `npx.cmd`
// wrapper and leaks the rest of the tree (BUG-3 in the audit) — `taskkill
// /T /F` is required. Extracted as pure command construction so the exact
// argv is unit-testable without actually spawning/killing anything.
describe("treeKillCommand", () => {
  it("builds a taskkill invocation on win32", () => {
    expect(treeKillCommand("win32", 4242)).toEqual({
      cmd: "taskkill",
      args: ["/pid", "4242", "/T", "/F"],
    });
  });

  it("builds a POSIX SIGTERM signal invocation elsewhere", () => {
    expect(treeKillCommand("linux", 4242)).toEqual({ signal: "SIGTERM", pid: 4242 });
    expect(treeKillCommand("darwin", 4242)).toEqual({ signal: "SIGTERM", pid: 4242 });
  });

  it("coerces the pid to a string in the taskkill args (taskkill requires a string arg)", () => {
    const r = treeKillCommand("win32", 99);
    expect(r).toHaveProperty("args");
    if ("args" in r) expect(r.args).toEqual(["/pid", "99", "/T", "/F"]);
  });
});
