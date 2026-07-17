import { describe, it, expect } from "vitest";
import { resolvePlaywrightUrls } from "./resolvePlaywrightUrls";

const feUrl = "http://127.0.0.1:3000";
const beUrl = "http://127.0.0.1:8001";

describe("resolvePlaywrightUrls", () => {
  it("derives E2E_BASE_URL/E2E_BACKEND_URL from the FE/BE urls when unset", () => {
    expect(resolvePlaywrightUrls(feUrl, beUrl, {})).toEqual({
      E2E_BASE_URL: feUrl,
      E2E_BACKEND_URL: beUrl,
    });
  });

  it("respects an explicit E2E_BASE_URL override instead of the derived FE url", () => {
    const resolved = resolvePlaywrightUrls(feUrl, beUrl, {
      E2E_BASE_URL: "http://localhost:4000",
    });
    expect(resolved.E2E_BASE_URL).toBe("http://localhost:4000");
    expect(resolved.E2E_BACKEND_URL).toBe(beUrl);
  });

  it("respects an explicit E2E_BACKEND_URL override instead of the derived BE url", () => {
    const resolved = resolvePlaywrightUrls(feUrl, beUrl, {
      E2E_BACKEND_URL: "http://localhost:9000",
    });
    expect(resolved.E2E_BASE_URL).toBe(feUrl);
    expect(resolved.E2E_BACKEND_URL).toBe("http://localhost:9000");
  });

  it("respects both explicit overrides at once", () => {
    const resolved = resolvePlaywrightUrls(feUrl, beUrl, {
      E2E_BASE_URL: "http://localhost:4000",
      E2E_BACKEND_URL: "http://localhost:9000",
    });
    expect(resolved).toEqual({
      E2E_BASE_URL: "http://localhost:4000",
      E2E_BACKEND_URL: "http://localhost:9000",
    });
  });
});
