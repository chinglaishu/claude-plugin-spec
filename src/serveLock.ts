// Spawn lock for `kg serve` — prevents two serve instances on the same repo
// from each starting their own copy of the FE/BE dev servers (double-listen,
// port clashes, orphaned processes). Pure decision logic here (acquire/stale/
// contended/release) takes an injected fs + isPidAlive so it is unit-testable
// without touching the real filesystem or `process.kill`. The thin wrapper
// that wires real `node:fs` + real pid liveness lives in serve.ts.

export interface LockFs {
  readFileSync(path: string): string;
  writeFileSync(path: string, content: string, flag: string): void;
  unlinkSync(path: string): void;
}

export interface LockInfo {
  pid: number;
  port: number;
  startedAt: string;
}

export type AcquireResult =
  | { status: "acquired" }
  | { status: "contended"; ownerPid: number; ownerPort: number };

function isErrnoException(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as NodeJS.ErrnoException).code === code;
}

function readLock(lockPath: string, fs: LockFs): LockInfo | null {
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath);
  } catch (e) {
    if (isErrnoException(e, "ENOENT")) return null;
    throw e;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LockInfo>;
    if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") return null;
    return { pid: parsed.pid, port: parsed.port, startedAt: String(parsed.startedAt ?? "") };
  } catch {
    return null;
  }
}

// Attempt to acquire the lock at `lockPath` for `self` (this process' pid + the
// port it will serve on). Semantics:
// - No lock file, or an unparsable/incomplete one, or one whose owner pid is
//   dead → treat as stale, write ours, "acquired".
// - A lock file whose owner pid is alive → "contended" (caller must NOT spawn
//   servers; it attaches to the existing managed instance instead).
// Written with the `wx` flag (fails if the file exists) so two processes
// racing to create it can't both believe they won; a raced EEXIST is handled
// by re-reading the (now-present) winner's lock and reporting contended.
export function acquireLock(
  lockPath: string,
  self: { pid: number; port: number },
  fs: LockFs,
  isPidAlive: (pid: number) => boolean
): AcquireResult {
  const existing = readLock(lockPath, fs);
  if (existing && isPidAlive(existing.pid)) {
    return { status: "contended", ownerPid: existing.pid, ownerPort: existing.port };
  }

  // Either no lock, a stale one (dead owner pid), or an unparsable/incomplete
  // one — in all these cases a lock FILE may still be sitting on disk, so
  // remove it first (best effort; ENOENT is fine) to give the `wx` write below
  // a clean slate.
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore — no file to remove, or removal failed; wx write still enforces atomicity */
  }

  const info: LockInfo = { pid: self.pid, port: self.port, startedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(lockPath, JSON.stringify(info), "wx");
    return { status: "acquired" };
  } catch (e) {
    if (!isErrnoException(e, "EEXIST")) throw e;
    // Lost the race — someone else created it between our read and our write.
    const winner = readLock(lockPath, fs);
    if (winner) return { status: "contended", ownerPid: winner.pid, ownerPort: winner.port };
    // Vanishingly unlikely (winner already gone) — report ourselves as contended
    // with unknown owner rather than risk a double-acquire; caller can retry.
    return { status: "contended", ownerPid: -1, ownerPort: -1 };
  }
}

// Release the lock — but ONLY if it is still ours (pid match). Never delete a
// lock owned by a different pid: that would let us clobber another instance's
// active lock during our own shutdown race.
export function releaseLock(lockPath: string, ownPid: number, fs: LockFs): void {
  const existing = readLock(lockPath, fs);
  if (!existing || existing.pid !== ownPid) return;
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore — best-effort cleanup on exit */
  }
}
