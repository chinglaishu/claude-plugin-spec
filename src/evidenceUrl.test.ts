// covers: REQ-KG-EVID-01, REQ-KG-EVID-02
import { describe, it, expect } from "vitest";
import { rawUrlToContentsApiUrl, base64ToDataUrl } from "./evidenceUrl";

describe("rawUrlToContentsApiUrl", () => {
  it("derives the GitHub Contents API URL from a raw.githubusercontent.com URL", () => {
    const raw =
      "https://raw.githubusercontent.com/acme-org/svc_frontend/e2e-evidence/kg-cases/add-4/a8193d04/01-add4-1-wizard.png";
    expect(rawUrlToContentsApiUrl(raw)).toBe(
      "https://api.github.com/repos/acme-org/svc_frontend/contents/kg-cases/add-4/a8193d04/01-add4-1-wizard.png?ref=e2e-evidence",
    );
  });

  it("URL-encodes each path segment (ref + path) but keeps the slash separators", () => {
    const raw =
      "https://raw.githubusercontent.com/owner/repo/branch/dir with space/a+b/img.png";
    expect(rawUrlToContentsApiUrl(raw)).toBe(
      "https://api.github.com/repos/owner/repo/contents/dir%20with%20space/a%2Bb/img.png?ref=branch",
    );
  });

  it("returns the URL unchanged (passthrough) when already a Contents API URL", () => {
    const api =
      "https://api.github.com/repos/acme-org/svc_frontend/contents/kg-cases/add-4/x.png?ref=e2e-evidence";
    expect(rawUrlToContentsApiUrl(api)).toBe(api);
  });

  it("returns null for a non-raw, non-api URL", () => {
    expect(rawUrlToContentsApiUrl("https://example.com/foo/bar.png")).toBeNull();
  });

  it("returns null for a malformed / too-short raw URL (no path after branch)", () => {
    expect(
      rawUrlToContentsApiUrl("https://raw.githubusercontent.com/owner/repo/branch"),
    ).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(rawUrlToContentsApiUrl("")).toBeNull();
    // @ts-expect-error runtime robustness
    expect(rawUrlToContentsApiUrl(null)).toBeNull();
    // @ts-expect-error runtime robustness
    expect(rawUrlToContentsApiUrl(undefined)).toBeNull();
  });
});

describe("base64ToDataUrl", () => {
  it("shapes a base64 payload into a PNG data URL", () => {
    expect(base64ToDataUrl("iVBORw0KGgo")).toBe("data:image/png;base64,iVBORw0KGgo");
  });

  it("strips whitespace/newlines the Contents API inserts into the base64 blob", () => {
    // GitHub returns the base64 wrapped every 60 chars with \n
    expect(base64ToDataUrl("iVBOR\nw0KG\ngo")).toBe("data:image/png;base64,iVBORw0KGgo");
  });

  it("returns null for empty / non-string content", () => {
    expect(base64ToDataUrl("")).toBeNull();
    // @ts-expect-error runtime robustness
    expect(base64ToDataUrl(null)).toBeNull();
  });
});
