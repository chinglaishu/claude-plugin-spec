// LiveHub — the testable core of the viewer's live auto-refresh (/api/live).
//
// It owns a Set of connected SSE clients and a DEBOUNCED broadcast: every graph
// rebuild rewrites tools/knowledge-graph.json (possibly several times mid-write),
// so serve.ts's fs.watch calls hub.notify() on each raw change and the hub
// coalesces a burst into ONE `graph-updated` push after a quiet window. On that
// push the viewer re-fetches /api/graph (which reads the final, fully-written
// file), so a spurious early notify just triggers a harmless re-fetch — but we
// debounce anyway to avoid a thundering herd of re-fetches per rebuild.
//
// Deliberately framework-free (only the tiny `write` + `on("close")` surface of a
// Node ServerResponse) so the debounce + client-set + disconnect logic is unit-
// tested against a fake client, with no real http server or fs.watch. The thin
// fs.watch glue that calls notify() lives in serve.ts and stays untested (like the
// other serve glue), because all the logic worth testing is here.

/** The minimal ServerResponse surface the hub needs. */
export interface SseClient {
  write(chunk: string): boolean;
  on(event: "close", cb: () => void): unknown;
}

export interface LiveHubOptions {
  /** Quiet window (ms) a burst of notify() calls is coalesced into one push. */
  debounceMs?: number;
  /** Interval (ms) for `: keepalive` comments so idle SSE isn't dropped by proxies/browsers. */
  keepaliveMs?: number;
}

export class LiveHub {
  private clients = new Set<SseClient>();
  private debounceMs: number;
  private keepaliveMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private counter = 0;
  private disposed = false;

  constructor(opts: LiveHubOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 300;
    this.keepaliveMs = opts.keepaliveMs ?? 25000;
  }

  get size(): number {
    return this.clients.size;
  }

  /** Register a client, send it `hello`, and return an unsubscribe fn. Also self-drops on "close". */
  subscribe(client: SseClient): () => void {
    if (this.disposed) return () => {};
    this.clients.add(client);
    // First subscriber arms the keepalive heartbeat.
    if (!this.keepaliveTimer) this.armKeepalive();
    client.on("close", () => this.remove(client));
    this.sendTo(client, `event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    return () => this.remove(client);
  }

  /** A raw file-change notification; coalesced into one debounced graph-updated broadcast. */
  notify(): void {
    if (this.disposed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.broadcast();
    }, this.debounceMs);
  }

  /** Push a `graph-updated` event to every connected client immediately (no debounce). */
  broadcast(): void {
    if (this.disposed) return;
    this.counter++;
    const frame = `event: graph-updated\ndata: ${JSON.stringify({ n: this.counter, at: new Date().toISOString() })}\n\n`;
    for (const client of [...this.clients]) this.sendTo(client, frame);
  }

  /** Tear down: clear timers, empty the client set. Idempotent. */
  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
    this.clients.clear();
  }

  private armKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      for (const client of [...this.clients]) this.sendTo(client, ": keepalive\n\n");
    }, this.keepaliveMs);
    // Don't keep the process alive just for the heartbeat.
    (this.keepaliveTimer as { unref?: () => void }).unref?.();
  }

  private remove(client: SseClient): void {
    this.clients.delete(client);
  }

  /** Write one frame, evicting a client whose socket is already dead (write throws). */
  private sendTo(client: SseClient, frame: string): void {
    try {
      client.write(frame);
    } catch {
      this.remove(client);
    }
  }
}
