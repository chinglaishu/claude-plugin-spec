import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Unambiguous AI-SDK / model-invocation markers. The Conflicts scan is out-of-platform (the
// kg-scan-conflicts skill) — the viewer and serve process must NEVER call an AI (REQ-KG-CONF-03).
const AI_MARKERS = /@anthropic-ai|bedrock-runtime|InvokeModel|messages\.create|openai|new OpenAI|generateText\(/;

describe("REQ-KG-CONF-03: no AI in viewer or serve", () => {
  for (const rel of ["../viewer.template.html", "serve.ts"]) {
    it(`${rel} contains no AI-SDK / model-invocation call`, () => {
      const src = readFileSync(join(here, rel), "utf8");
      expect(AI_MARKERS.test(src)).toBe(false);
    });
  }
});
