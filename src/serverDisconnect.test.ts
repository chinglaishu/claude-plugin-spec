import { describe, it, expect } from "vitest";
import http from "node:http";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";

// Regression test for a real live bug found during integration verification: serve.ts's /api/run
// handler fully drains the request body FIRST (`req.on("data")` + `await ... req.on("end")` to
// parse the JSON caseId) and only THEN starts streaming the SSE response. Once an
// IncomingMessage (`req`) has already emitted its own "end", Node does not reliably re-emit
// "close" on it later when the underlying socket is torn down mid-response (e.g. the browser
// panel closing, or the client aborting a fetch) — so a client-disconnect listener registered on
// `req` (as serve.ts originally had it, twice) silently never fires, which meant the
// tree-kill-on-disconnect path (audit BUG-3) never ran: the whole spawned Playwright/Chrome
// process tree leaked on every real-world panel close.
//
// `res` (the ServerResponse) is the correct, Node-documented signal: "close" fires on it when the
// response has been terminated, INCLUDING when the underlying connection is destroyed — this
// holds regardless of whether the request body was already fully consumed. This test proves the
// asymmetry directly against a real (not mocked) HTTP server + client, using the exact
// read-body-then-stream shape serve.ts uses, so a future regression back to `req.on("close")`
// fails loudly rather than silently leaking processes again in production.
describe("client-disconnect detection: res.on('close') vs req.on('close') after the body is drained", () => {
  it("res.on('close') fires when the client destroys its connection mid-response; req.on('close') does not", async () => {
    const events: string[] = [];

    const server = http.createServer(async (req, res) => {
      // Mirror serve.ts /api/run: fully drain the request body before streaming a response.
      let body = "";
      req.on("data", (c) => (body += c));
      await new Promise<void>((resolve) => req.on("end", () => resolve()));
      void body;

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      req.on("close", () => events.push("req-close"));
      res.on("close", () => events.push("res-close"));

      let n = 0;
      const iv = setInterval(() => {
        n++;
        res.write(`data: tick ${n}\n\n`);
        if (n >= 50) { clearInterval(iv); res.end(); } // safety cap if the client never disconnects
      }, 20);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const clientReq = http.request({ hostname: "127.0.0.1", port, path: "/", method: "POST" }, (res) => {
        let ticks = 0;
        res.on("data", () => {
          ticks++;
          if (ticks === 3) {
            clientReq.destroy(); // simulates the browser panel closing / fetch aborting mid-stream
            // Give the server's close handlers a moment to fire before asserting.
            setTimeout(() => { server.close(); resolve(); }, 300);
          }
        });
      });
      clientReq.on("error", () => {}); // destroying the request legitimately raises a socket error
      clientReq.end(JSON.stringify({ caseId: "x" }));
      setTimeout(() => reject(new Error("test timed out waiting for 3 ticks")), 5000);
    });

    expect(events).toContain("res-close"); // the reliable signal serve.ts must use
    expect(events).not.toContain("req-close"); // the ORIGINAL (buggy) signal never fires here
  });
});

// Regression: serve.ts's /api/run handler calls `res.end()` itself once the spawned Playwright
// process completes normally (proc.on("close", ...) → send("exit") → res.end()). res.end() makes
// Node emit "close" on `res` too — the SAME event the disconnect-tree-kill listener is on — so
// without a guard, every normal run finish also fired a wasteful `treeKill` against a PID that had
// already exited (spawns a real taskkill process on Windows for nothing, and is a theoretical
// PID-reuse race). serve.ts now sets an `exited` flag inside `proc.on("close"/"error", ...)`
// BEFORE calling res.end(), and the res "close" handler only tree-kills when `!exited`. This test
// reproduces serve.ts's exact wiring order (child "close" fires and sets the flag, then res.end()
// synchronously, whose "close" the same tick/soon-after triggers the guarded handler) against a
// fake child-process EventEmitter, proving treeKill is skipped on normal completion but still
// fires for a genuine still-running disconnect.
describe("treeKill guard: no kill on normal completion, still kills on genuine disconnect", () => {
  function makeFakeProc(pid: number) {
    const proc = new EventEmitter() as EventEmitter & { pid: number; killed: boolean };
    proc.pid = pid;
    proc.killed = false;
    return proc;
  }

  it("does not tree-kill when the child already closed before res emits close (normal completion)", async () => {
    const killedPids: number[] = [];
    const treeKill = (pid: number) => killedPids.push(pid);
    const proc = makeFakeProc(1234);

    let exited = false;
    proc.on("close", () => { exited = true; /* serve.ts: send("exit"...); res.end(); */ });

    const res = new EventEmitter() as EventEmitter & { on: any };
    res.on("close", () => { if (!exited && !proc.killed && proc.pid) treeKill(proc.pid); });

    // Mirrors serve.ts: the child's own "close" (normal completion) fires first, setting `exited`,
    // and res.end() (called from within that handler) is what causes res's own "close" afterward.
    proc.emit("close", 0);
    res.emit("close");

    expect(killedPids).toEqual([]);
  });

  it("still tree-kills when res closes (client disconnect) while the child has not exited yet", () => {
    const killedPids: number[] = [];
    const treeKill = (pid: number) => killedPids.push(pid);
    const proc = makeFakeProc(5678);

    let exited = false;
    proc.on("close", () => { exited = true; });

    const res = new EventEmitter() as EventEmitter & { on: any };
    res.on("close", () => { if (!exited && !proc.killed && proc.pid) treeKill(proc.pid); });

    // Client disconnects mid-run: res "close" fires while the child is still running (proc's own
    // "close" never fired, so `exited` is still false).
    res.emit("close");

    expect(killedPids).toEqual([5678]);
  });
});
