// Pure readiness-gate policy for the pre-run server check in serve.ts.
//
// Distinguishes two very different situations that both show up as "servers
// not fully healthy yet":
//   1. Nothing is listening on a port at all → Playwright's own `webServer`
//      config will start it (per playwright.config.ts's `reuseExistingServer`
//      auto-start behaviour) — the gate's job here is just to get out of the
//      way, so this is "proceed" immediately regardless of elapsed time.
//   2. Something IS listening but never turns healthy (`.ok`) within the
//      window — e.g. a wedged/previous dev-server process still bound to the
//      port, or a mid-compile Next.js server serving non-2xx — Playwright's
//      `reuseExistingServer` would otherwise blindly reuse it and every run
//      would 404. This is the case the gate exists to catch: keep polling
//      ("wait") until healthy or until the timeout, then "serverNotReady".
//
// `feListening`/`beListening` = something answered the TCP/HTTP request at
// all (even a non-2xx). `feOk`/`beOk` = isUp() semantics (2xx). A port that
// is "ok" is necessarily "listening" too; callers should pass true for both
// in that case (as the tests do).
export type GateResult = "proceed" | "wait" | "serverNotReady";

export function gateDecision(
  feListening: boolean,
  feOk: boolean,
  beListening: boolean,
  beOk: boolean,
  waitedMs: number,
  timeoutMs: number
): GateResult {
  if (feOk && beOk) return "proceed";

  // A side is "wedged" when something is listening there but it has never
  // become healthy — that's the specific failure mode the gate must catch.
  const feWedged = feListening && !feOk;
  const beWedged = beListening && !beOk;

  if (!feWedged && !beWedged) {
    // Neither side is a wedged listener — any not-yet-ok side simply has
    // nothing listening, which Playwright will start itself. Nothing to gate.
    return "proceed";
  }

  if (waitedMs >= timeoutMs) return "serverNotReady";
  return "wait";
}
