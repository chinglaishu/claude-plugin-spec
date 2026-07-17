import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { resolveBackendVenvPython } from "./resolveBackendVenvPython";

const repoRoot = "/repo";
const backendDir = "/repo/dojostack_backend";

describe("resolveBackendVenvPython", () => {
  it("picks the backend-package venv when only that layout exists (this repo's actual layout)", () => {
    const rootVenvPython = join(repoRoot, ".venv", "bin", "python");
    const backendVenvPython = join(backendDir, ".venv", "bin", "python");
    const exists = (p: string) => p === backendVenvPython;

    const resolved = resolveBackendVenvPython(repoRoot, backendDir, "darwin", exists, join);

    expect(resolved).toBe(backendVenvPython);
    expect(resolved).not.toBe(rootVenvPython);
  });

  it("picks the root venv when only that layout exists", () => {
    const rootVenvPython = join(repoRoot, ".venv", "bin", "python");
    const exists = (p: string) => p === rootVenvPython;

    expect(resolveBackendVenvPython(repoRoot, backendDir, "darwin", exists, join)).toBe(rootVenvPython);
  });

  it("prefers the root venv when both layouts exist", () => {
    const rootVenvPython = join(repoRoot, ".venv", "bin", "python");
    const exists = () => true;

    expect(resolveBackendVenvPython(repoRoot, backendDir, "darwin", exists, join)).toBe(rootVenvPython);
  });

  it("falls back to the root-level path when neither exists yet", () => {
    const rootVenvPython = join(repoRoot, ".venv", "bin", "python");
    const exists = () => false;

    expect(resolveBackendVenvPython(repoRoot, backendDir, "darwin", exists, join)).toBe(rootVenvPython);
  });

  it("uses the Windows Scripts/python.exe layout on win32", () => {
    const winRootVenvPython = join(repoRoot, ".venv", "Scripts", "python.exe");
    const exists = (p: string) => p === winRootVenvPython;

    expect(resolveBackendVenvPython(repoRoot, backendDir, "win32", exists, join)).toBe(winRootVenvPython);
  });
});
