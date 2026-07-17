import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { LiveHub, type SseClient } from "./liveHub";

// A fake SSE client — the minimal ServerResponse surface the hub uses (write + "close" event).
// It records every SSE frame written so tests can assert on the exact event stream, and it
// exposes emitClose() to simulate a browser tab / EventSource disconnecting.
function makeClient(): SseClient & { frames: string[]; emitClose: () => void } {
  const ee = new EventEmitter();
  const frames: string[] = [];
  const client = {
    write(s: string) {
      frames.push(s);
      return true;
    },
    on(event: string, cb: () => void) {
      ee.on(event, cb);
      return client;
    },
    frames,
    emitClose() {
      ee.emit("close");
    },
  };
  return client as unknown as SseClient & { frames: string[]; emitClose: () => void };
}

describe("LiveHub", () => {
  it("sends an initial `hello` event to a new subscriber", () => {
    const hub = new LiveHub();
    const c = makeClient();
    hub.subscribe(c);
    expect(c.frames.join("")).toContain("event: hello");
    hub.dispose();
  });

  it("tracks connected clients in its size, and drops one on its `close` event", () => {
    const hub = new LiveHub();
    const a = makeClient();
    const b = makeClient();
    hub.subscribe(a);
    hub.subscribe(b);
    expect(hub.size).toBe(2);
    a.emitClose();
    expect(hub.size).toBe(1);
    b.emitClose();
    expect(hub.size).toBe(0);
    hub.dispose();
  });

  it("unsubscribe (returned by subscribe) also removes the client", () => {
    const hub = new LiveHub();
    const a = makeClient();
    const off = hub.subscribe(a);
    expect(hub.size).toBe(1);
    off();
    expect(hub.size).toBe(0);
    hub.dispose();
  });

  it("debounces a burst of notify() calls into a single graph-updated broadcast", () => {
    vi.useFakeTimers();
    try {
      const hub = new LiveHub({ debounceMs: 300 });
      const c = makeClient();
      hub.subscribe(c);
      c.frames.length = 0; // ignore the hello frame

      hub.notify();
      hub.notify();
      hub.notify(); // a mid-write burst — 3 fs events for one logical rebuild

      // Nothing pushed until the quiet window elapses.
      expect(c.frames.join("")).not.toContain("graph-updated");
      vi.advanceTimersByTime(299);
      expect(c.frames.join("")).not.toContain("graph-updated");
      vi.advanceTimersByTime(1);

      const out = c.frames.join("");
      const matches = out.match(/event: graph-updated/g) || [];
      expect(matches.length).toBe(1); // coalesced to exactly ONE push
    } finally {
      vi.useRealTimers();
    }
  });

  it("broadcasts graph-updated to every connected client", () => {
    vi.useFakeTimers();
    try {
      const hub = new LiveHub({ debounceMs: 100 });
      const a = makeClient();
      const b = makeClient();
      hub.subscribe(a);
      hub.subscribe(b);
      a.frames.length = 0;
      b.frames.length = 0;
      hub.notify();
      vi.advanceTimersByTime(100);
      expect(a.frames.join("")).toContain("event: graph-updated");
      expect(b.frames.join("")).toContain("event: graph-updated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not broadcast to a client that already disconnected", () => {
    vi.useFakeTimers();
    try {
      const hub = new LiveHub({ debounceMs: 100 });
      const a = makeClient();
      const b = makeClient();
      hub.subscribe(a);
      hub.subscribe(b);
      a.frames.length = 0;
      b.frames.length = 0;
      a.emitClose(); // a leaves before the debounced push fires
      hub.notify();
      vi.advanceTimersByTime(100);
      expect(a.frames.join("")).not.toContain("event: graph-updated");
      expect(b.frames.join("")).toContain("event: graph-updated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends periodic keepalive comments to connected clients", () => {
    vi.useFakeTimers();
    try {
      const hub = new LiveHub({ keepaliveMs: 25000 });
      const c = makeClient();
      hub.subscribe(c);
      c.frames.length = 0;
      vi.advanceTimersByTime(25000);
      expect(c.frames.join("")).toContain(": keepalive");
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose() clears timers and empties the client set", () => {
    vi.useFakeTimers();
    try {
      const hub = new LiveHub({ debounceMs: 100 });
      const c = makeClient();
      hub.subscribe(c);
      hub.notify();
      hub.dispose();
      expect(hub.size).toBe(0);
      c.frames.length = 0;
      // A pending debounced push must not fire after dispose.
      vi.advanceTimersByTime(1000);
      expect(c.frames.join("")).not.toContain("graph-updated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a write that throws (dead socket) is swallowed and drops that client", () => {
    vi.useFakeTimers();
    try {
      const hub = new LiveHub({ debounceMs: 100 });
      const good = makeClient();
      const bad = makeClient();
      // bad.write throws as if the socket were already torn down.
      (bad as unknown as { write: () => boolean }).write = () => {
        throw new Error("EPIPE");
      };
      hub.subscribe(good);
      hub.subscribe(bad);
      good.frames.length = 0;
      hub.notify();
      // Must not throw even though one client's write blows up.
      expect(() => vi.advanceTimersByTime(100)).not.toThrow();
      expect(good.frames.join("")).toContain("event: graph-updated");
      expect(hub.size).toBe(1); // the bad client was evicted
    } finally {
      vi.useRealTimers();
    }
  });
});
