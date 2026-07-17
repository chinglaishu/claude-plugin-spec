import { describe, it, expect } from "vitest";
import { REPOS } from "./topology.fixture";
import { parseInstruction, parseAgent, parseHooks } from "./parseConfig";

describe("parseInstruction", () => {
  const claude = `# Frontend\n@../.github/instructions/frontend.instructions.md\nsome text`;
  it("instruction node + imports edge", () => {
    const { nodes, edges } = parseInstruction({ path: "svc_frontend/CLAUDE.md", content: claude }, REPOS);
    expect(nodes[0].type).toBe("instruction");
    expect(nodes[0].id).toBe("frontend:claude");
    expect(nodes[0].title).toBe("claude");
    expect(edges).toContainEqual({ from: nodes[0].id, to: "frontend-instructions", type: "imports", source: "svc_frontend/CLAUDE.md" });
  });
  it("ignores non-md @-lines (decorators) and only emits edge for .md imports", () => {
    const content = `# Mixed\n@../x/foo.instructions.md\n@decorator("y")\nsome text`;
    const { nodes, edges } = parseInstruction({ path: "CLAUDE.md", content }, REPOS);
    expect(nodes[0].id).toBe("main:claude");
    expect(nodes[0].title).toBe("claude");
    const importEdges = edges.filter((e) => e.type === "imports");
    expect(importEdges).toHaveLength(1);
    expect(importEdges[0].to).toBe("foo-instructions");
  });
  it("applies-to from applyTo frontmatter", () => {
    const inst = `---\napplyTo: "svc_frontend/**"\n---\nrules`;
    const { nodes, edges } = parseInstruction({ path: ".github/instructions/frontend.instructions.md", content: inst }, REPOS);
    expect(nodes[0].id).toBe("main:frontend-instructions");
    expect(nodes[0].title).toBe("frontend-instructions");
    expect(edges).toContainEqual({ from: nodes[0].id, to: "svc_frontend/**", type: "applies-to", source: ".github/instructions/frontend.instructions.md" });
  });
});

describe("parseAgent", () => {
  it("agent node from frontmatter", () => {
    const a = `---\nname: code-review\ndescription: Reviews the diff\n---\nprompt`;
    const { nodes } = parseAgent({ path: ".claude/agents/code-review.md", content: a }, REPOS);
    expect(nodes[0]).toMatchObject({ id: "main:code-review", type: "agent", title: "code-review" });
  });
});

describe("parseHooks", () => {
  const settings = JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: "run code-review agent" }] }] },
  });
  it("hook node + triggers + activates-on", () => {
    const { nodes, edges } = parseHooks({ path: ".claude/settings.json", content: settings }, REPOS);
    const hook = nodes.find((n) => n.type === "hook")!;
    expect(hook.id).toBe("main:hook:Stop");
    expect(hook.title).toContain("Stop");
    expect(edges).toContainEqual({ from: hook.id, to: "Stop", type: "activates-on", source: ".claude/settings.json" });
    expect(edges).toContainEqual({ from: hook.id, to: "code-review", type: "triggers", source: ".claude/settings.json" });
  });
});
