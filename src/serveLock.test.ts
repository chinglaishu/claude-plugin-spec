import { describe, it, expect, vi } from "vitest";
import { acquireLock, releaseLock, type LockFs } from "./serveLock";

const LOCK_PATH = "/repo/.kg-serve.lock";

function makeFs(initial?: { path: string; content: string }): LockFs & {
  files: Map<string, string>;
  writes: Array<{ path: string; content: string; flag: string }>;
} {
  const files = new Map<string, string>();
  if (initial) files.set(initial.path, initial.content);
  const writes: Array<{ path: string; content: string; flag: string }> = [];
  return {
    files,
    writes,
    readFileSync(path: string): string {
      const v = files.get(path);
      if (v === undefined) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
    writeFileSync(path: string, content: string, flag: string): void {
      if (flag === "wx" && files.has(path)) {
        const err = new Error("EEXIST") as NodeJS.ErrnoException;
        err.code = "EEXIST";
        throw err;
      }
      files.set(path, content);
      writes.push({ path, content, flag });
    },
    unlinkSync(path: string): void {
      files.delete(path);
    },
  };
}

describe("acquireLock", () => {
  it("acquires cleanly when no lock file exists (fresh boot)", () => {
    const fs = makeFs();
    const result = acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, () => true);
    expect(result.status).toBe("acquired");
    const written = JSON.parse(fs.files.get(LOCK_PATH)!);
    expect(written).toMatchObject({ pid: 111, port: 8971 });
    expect(typeof written.startedAt).toBe("string");
  });

  it("writes the lock file atomically using the wx flag (fails if it appears mid-write)", () => {
    const fs = makeFs();
    acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, () => true);
    expect(fs.writes[0].flag).toBe("wx");
  });

  it("reports contended + the owning pid/port when the lock is held by a live process", () => {
    const fs = makeFs({
      path: LOCK_PATH,
      content: JSON.stringify({ pid: 222, port: 8972, startedAt: "2026-01-01T00:00:00.000Z" }),
    });
    const isPidAlive = vi.fn(() => true);
    const result = acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, isPidAlive);
    expect(result).toEqual({ status: "contended", ownerPid: 222, ownerPort: 8972 });
    expect(isPidAlive).toHaveBeenCalledWith(222);
    // must not have clobbered the existing lock
    expect(fs.files.get(LOCK_PATH)).toContain("222");
  });

  it("replaces a stale lock (owner pid is dead) and acquires", () => {
    const fs = makeFs({
      path: LOCK_PATH,
      content: JSON.stringify({ pid: 999, port: 8972, startedAt: "2026-01-01T00:00:00.000Z" }),
    });
    const result = acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, () => false);
    expect(result.status).toBe("acquired");
    const written = JSON.parse(fs.files.get(LOCK_PATH)!);
    expect(written.pid).toBe(111);
  });

  it("treats an unparsable lock file as stale and replaces it", () => {
    const fs = makeFs({ path: LOCK_PATH, content: "{not json" });
    const result = acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, () => true);
    expect(result.status).toBe("acquired");
  });

  it("treats a lock file missing a numeric pid as stale and replaces it", () => {
    const fs = makeFs({ path: LOCK_PATH, content: JSON.stringify({ port: 8972 }) });
    const result = acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, () => true);
    expect(result.status).toBe("acquired");
  });

  it("handles the EEXIST race (file appears between our check and write) by re-reading and reporting contended", () => {
    let firstRead = true;
    const fs: LockFs = {
      readFileSync(path: string): string {
        if (firstRead) {
          firstRead = false;
          const err = new Error("ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        return JSON.stringify({ pid: 333, port: 8973, startedAt: "x" });
      },
      writeFileSync(): void {
        const err = new Error("EEXIST") as NodeJS.ErrnoException;
        err.code = "EEXIST";
        throw err;
      },
      unlinkSync(): void {},
    };
    const result = acquireLock(LOCK_PATH, { pid: 111, port: 8971 }, fs, () => true);
    expect(result).toEqual({ status: "contended", ownerPid: 333, ownerPort: 8973 });
  });
});

describe("releaseLock", () => {
  it("removes the lock file when it is owned by our pid", () => {
    const fs = makeFs({
      path: LOCK_PATH,
      content: JSON.stringify({ pid: 111, port: 8971, startedAt: "x" }),
    });
    releaseLock(LOCK_PATH, 111, fs);
    expect(fs.files.has(LOCK_PATH)).toBe(false);
  });

  it("does nothing when the lock file is owned by a different pid (never release someone else's lock)", () => {
    const fs = makeFs({
      path: LOCK_PATH,
      content: JSON.stringify({ pid: 222, port: 8972, startedAt: "x" }),
    });
    releaseLock(LOCK_PATH, 111, fs);
    expect(fs.files.has(LOCK_PATH)).toBe(true);
  });

  it("is a no-op when no lock file exists", () => {
    const fs = makeFs();
    expect(() => releaseLock(LOCK_PATH, 111, fs)).not.toThrow();
  });

  it("is a no-op when the lock file is unparsable", () => {
    const fs = makeFs({ path: LOCK_PATH, content: "{bad" });
    expect(() => releaseLock(LOCK_PATH, 111, fs)).not.toThrow();
    expect(fs.files.has(LOCK_PATH)).toBe(true);
  });
});
