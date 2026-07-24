// covers: REQ-KG-04
import { describe, it, expect } from "vitest";
import { gateDecision } from "./gateDecision";

// gateDecision is the pure readiness-gate policy extracted out of ensureServers
// / the pre-run gate in serve.ts, so the tricky branching (nothing listening →
// let Playwright manage servers; something listening but never healthy → give
// up; still within the timeout → keep waiting) is unit-testable without a real
// HTTP server or real timers.
describe("gateDecision", () => {
  it("proceeds immediately when both servers are already up and healthy", () => {
    expect(gateDecision(true, true, true, true, 0, 60_000)).toBe("proceed");
  });

  it("proceeds when NOTHING is listening on either port (Playwright will manage servers itself)", () => {
    expect(gateDecision(false, false, false, false, 0, 60_000)).toBe("proceed");
  });

  it("proceeds when nothing listens on one side and the other side is fully healthy (still nobody wedged)", () => {
    // FE not up at all, BE fully healthy — FE will be Playwright-managed.
    expect(gateDecision(false, false, true, true, 0, 60_000)).toBe("proceed");
  });

  it("waits when a port is listening but not yet returning .ok, and we're inside the timeout window", () => {
    // FE listening (compiling) but not healthy yet; BE fine.
    expect(gateDecision(true, false, true, true, 5_000, 60_000)).toBe("wait");
  });

  it("waits when neither has confirmed ok yet but at least one is listening, within the window", () => {
    expect(gateDecision(true, false, true, false, 100, 60_000)).toBe("wait");
  });

  it("gives up (serverNotReady) when a listening-but-unhealthy port exceeds the timeout", () => {
    expect(gateDecision(true, false, true, true, 60_001, 60_000)).toBe("serverNotReady");
  });

  it("gives up exactly at the timeout boundary (waitedMs === timeoutMs counts as elapsed)", () => {
    expect(gateDecision(true, false, true, true, 60_000, 60_000)).toBe("serverNotReady");
  });

  it("proceeds once the previously-wedged listener turns healthy before the timeout", () => {
    expect(gateDecision(true, true, true, true, 55_000, 60_000)).toBe("proceed");
  });

  it("waits (not serverNotReady) when backend is the wedged one and frontend is healthy", () => {
    expect(gateDecision(true, true, true, false, 1_000, 60_000)).toBe("wait");
  });

  it("gives up when backend is the one that stays wedged past the timeout", () => {
    expect(gateDecision(true, true, true, false, 60_500, 60_000)).toBe("serverNotReady");
  });

  it("respects a custom timeout (KG_READY_TIMEOUT override)", () => {
    expect(gateDecision(true, false, true, true, 4_999, 5_000)).toBe("wait");
    expect(gateDecision(true, false, true, true, 5_000, 5_000)).toBe("serverNotReady");
  });
});
