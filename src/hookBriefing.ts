// hookBriefing.ts — the PreToolUse hook's half of the contract (REQ-KG-CTX-01).
//
// THIS PLUGIN GOT THE CONTRACT WRONG IN BOTH DIRECTIONS, and `|| true` hid it:
//
//   IN  — `hooks.json` passed `"${TOOL_INPUT_FILE_PATH}"`, which Claude Code does not substitute. It
//         expanded to an empty string, `agentContextCli` printed its usage line, and the `|| true`
//         swallowed the non-zero exit. The real input is JSON on STDIN.
//   OUT — a PreToolUse hook's plain stdout is DISCARDED, and a bare permission decision is
//         classified "harness-only — no model context cost". Only `additionalContext` reaches the
//         model, so even a correct path plus a decision produced silence.
//
// Net effect: the briefing never reached one session. Founding design §5 calls this deliverable "the
// gold, and the cheapest" — the thing that stops the graph being an expensive lint — and it was inert
// the whole time, which is precisely the failure mode §9c names: a gate that reports nothing is
// indistinguishable from a codebase where everything is fine.
//
// PURE, and given its input rather than reading stdin itself, because the two mistakes above are only
// catchable by a test that can hand this function a real payload.
import { renderPack, type ContextPack } from "./agentContext";

/** The subset of Claude Code's PreToolUse payload this hook needs. */
interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
}

export interface HookDecision {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow";
    permissionDecisionReason: string;
    /** The field that actually puts text in front of the model. Without it Claude Code classifies the
     *  hook "harness-only — no model context cost" and the briefing reaches nobody. */
    additionalContext: string;
  };
}

/**
 * PURE. The path about to be edited, or null when the payload names none.
 *
 * `Edit`/`Write` carry `file_path`; `NotebookEdit` carries `notebook_path`. Returning null rather
 * than guessing matters: a fabricated path would brief the agent about the wrong file, which is worse
 * than briefing it about none.
 */
export function editedPathFrom(rawStdin: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStdin);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const input = (parsed as HookInput).tool_input;
  const path = input?.file_path ?? input?.notebook_path;
  return typeof path === "string" && path ? path : null;
}

/**
 * PURE. The briefing, in the one field the model actually reads.
 *
 * ALWAYS `allow`, including on a halt. That is the documented design (see hooks.json): the halt is an
 * instruction to staff, not a veto, because a project that has not been governed yet must never be
 * locked out of its own repo on install day. The blocking gate is `npm run check`, which runs where a
 * human can see why it failed.
 */
export function hookDecision(pack: ContextPack): HookDecision {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: pack.halt
        ? "This path has no governing requirement."
        : "Governing context supplied.",
      additionalContext: renderPack(pack),
    },
  };
}
