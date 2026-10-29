import type { AgentPromptBlock } from "@asterism-app/builtin-api/contracts";
import { describe, expect, it } from "vitest";
import { projectAgentPrompt } from "./system-prompt.ts";

describe("Runtime system prompt assembly and model projection", () => {
  it("original prompt blocks retain independent origins while model views render in declared order and escape boundaries", () => {
    const blocks: AgentPromptBlock[] = [
      { id: "plugin", source: { id: "plugin", plugin: "example.plugin" }, kind: "system", from: 'plugin\"<&', text: "Read <resource> & </end>; keep a < b, 1<2 and -> as is." },
      { id: "agent", source: { id: "agent", plugin: "example.plugin" }, kind: "agent", role: "worker", text: "Work carefully." },
    ];
    expect(projectAgentPrompt(blocks).blocks.map(block => block.text).join("\n\n")).toBe(
      '<system from="plugin&quot;&lt;&amp;">\nRead &lt;resource> & &lt;/end>; keep a < b, 1<2 and -> as is.\n</system>\n\n<agent role="worker">\nWork carefully.\n</agent>',
    );
    expect(blocks[0]?.text).toBe("Read <resource> & </end>; keep a < b, 1<2 and -> as is.");
  });
});
