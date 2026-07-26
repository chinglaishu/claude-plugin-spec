// covers: REQ-KG-CTX-01
import { describe, it, expect } from "vitest";
import { editedPathFrom, hookDecision } from "./hookBriefing";
import type { ContextPack } from "./agentContext";

/**
 * The hook contract, which this plugin got wrong in both directions from the day it shipped.
 *
 * `hooks.json` passed `"${TOOL_INPUT_FILE_PATH}"` — not a substitution Claude Code performs. It
 * expanded to an empty string, the CLI printed its usage line and exited 2, and `|| true` swallowed
 * that. And even had the path arrived, a PreToolUse hook's plain stdout is DISCARDED: the model sees
 * `permissionDecisionReason`, nothing else. So the briefing — founding design §5's "gold", the thing
 * that makes the graph get consulted at all — never reached a single session.
 *
 * Both halves are asserted here because fixing either one alone still yields silence.
 */

const pack = (over: Partial<ContextPack> = {}): ContextPack => ({
  path: "src/pay.ts",
  governedBy: [],
  features: [],
  requirements: [],
  tests: [],
  conflicts: [],
  halt: false,
  grandfathered: false,
  ...over,
});

describe("editedPathFrom — the path arrives as JSON on stdin, never as an env var", () => {
  it("reads file_path for Edit and Write", () => {
    expect(editedPathFrom(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "/repo/src/a.ts" } })))
      .toBe("/repo/src/a.ts");
    expect(editedPathFrom(JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/repo/src/b.ts" } })))
      .toBe("/repo/src/b.ts");
  });

  // NotebookEdit names its target differently. Missing this means notebooks silently get no briefing
  // while every other edit gets one — the worst kind of gap, because it looks like it works.
  it("reads notebook_path for NotebookEdit", () => {
    expect(editedPathFrom(JSON.stringify({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/repo/n.ipynb" } })))
      .toBe("/repo/n.ipynb");
  });

  it("returns null rather than guessing when there is no path", () => {
    expect(editedPathFrom(JSON.stringify({ tool_name: "Edit", tool_input: {} }))).toBeNull();
    expect(editedPathFrom("not json")).toBeNull();
    expect(editedPathFrom("")).toBeNull();
  });
});

describe("hookDecision — only additionalContext reaches the model", () => {
  it("emits the shape a PreToolUse hook must emit", () => {
    const out = hookDecision(pack({ governedBy: [{ id: "main:spec", title: "Spec" }] }));
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  /**
   * THE FIELD THAT ACTUALLY INJECTS. A PreToolUse hook returning only a permission decision is
   * classified by Claude Code as "harness-only — no model context cost", and the briefing reaches
   * nobody: verified against a live install, where `plugin details` said exactly that and a Write
   * produced no briefing at all. `additionalContext` is the field that puts text beside the tool
   * result. `permissionDecisionReason` is kept as well — it explains the decision — but on its own it
   * was the third way this hook found to be silent.
   */
  it("puts the briefing in additionalContext, which is what reaches the model", () => {
    const out = hookDecision(pack({ halt: true, reason: "Nothing governs this path" }));
    expect(out.hookSpecificOutput.additionalContext).toMatch(/STOP/);
  });

  // The whole point. A decision with no context is a hook that allows the edit and says nothing —
  // exactly the silence this replaces.
  it("carries the whole briefing, not a summary of it", () => {
    const out = hookDecision(pack({
      governedBy: [{ id: "main:spec", title: "Checkout spec", path: ".github/system-design/C.md" }],
      requirements: [{ id: "REQ-1", text: "A total sums its lines.", provenBy: [], draft: false }],
    }));
    const reason = out.hookSpecificOutput.additionalContext;
    expect(reason).toMatch(/Checkout spec/);
    expect(reason).toMatch(/REQ-1/);
    expect(reason).toMatch(/NO COVERING TEST/);
  });

  // permissionDecisionReason explains the DECISION and is short; the briefing itself is the context.
  // Conflating them is what made this silent — a long reason on an `allow` is read by nobody.
  it("keeps the decision's reason short and distinct from the briefing", () => {
    const out = hookDecision(pack({ halt: true, reason: "Nothing governs this path" }));
    expect(out.hookSpecificOutput.permissionDecisionReason).toMatch(/no governing requirement/i);
    expect(out.hookSpecificOutput.permissionDecisionReason.length).toBeLessThan(120);
  });

  // Non-blocking is the documented design (hooks.json): a project that has not been governed yet must
  // never be locked out of its own repo on install day. The halt is an instruction, not a veto.
  it("never denies the edit, even on a halt", () => {
    expect(hookDecision(pack({ halt: true, reason: "x" })).hookSpecificOutput.permissionDecision).toBe("allow");
  });
});
