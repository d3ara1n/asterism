import type { SystemPrompt } from "@asterism-app/sdk/contracts";
import { describe, expect, it } from "vitest";
import { projectSystemPrompt } from "./system-prompt.ts";
import { composeSystemPrompt } from "@asterism-app/builtin/runtime";

describe("Runtime system prompt assembly and model projection", () => {
  it("original prompt blocks retain independent origins while model views render in declared order and escape boundaries", () => {
    const prompt: SystemPrompt = { blocks: [
      { id: "plugin", kind: "system", from: 'plugin\"<&', text: "Read <resource> & </end>; keep a < b, 1<2 and -> as is." },
      { id: "agent", kind: "agent", role: "worker", text: "Work carefully." },
    ] };
    expect(projectSystemPrompt(prompt)).toBe(
      '<system from="plugin&quot;&lt;&amp;">\nRead &lt;resource> & &lt;/end>; keep a < b, 1<2 and -> as is.\n</system>\n\n<agent role="worker">\nWork carefully.\n</agent>',
    );
    expect(prompt.blocks[0]?.text).toBe("Read <resource> & </end>; keep a < b, 1<2 and -> as is.");
  });
  it("reassembly uses the harness in code; local replacements do not alter subsequently loaded built-in definitions", () => {
    const agent = { id: "worker", systemPrompt: "Role instructions" };
    const first = composeSystemPrompt(agent, "Asterism");
    const original = projectSystemPrompt(first);
    first.blocks[0]!.text = "Replaced by an extension";
    expect(projectSystemPrompt(first)).toContain("Replaced by an extension");
    const reloaded = composeSystemPrompt(agent, "Asterism");
    expect(projectSystemPrompt(reloaded)).toBe(original);
    expect(reloaded.blocks.map(block => block.kind)).toEqual(["system", "agent"]);
    expect(reloaded.blocks[1]).toMatchObject({ role: "worker", text: "Role instructions" });
  });
});
