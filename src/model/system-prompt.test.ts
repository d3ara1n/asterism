import { describe, expect, it } from "vitest";
import { composeSystemPrompt, projectSystemPrompt, type SystemPrompt } from "./system-prompt.ts";

describe("系统提示词的运行时组装与模型投影", () => {
  it("原始提示块保留独立来源，模型视图按声明顺序渲染并转义边界", () => {
    const prompt: SystemPrompt = { blocks: [
      { id: "plugin", kind: "system", from: 'plugin\"<&', text: "Read <resource> & continue." },
      { id: "agent", kind: "agent", role: "worker", text: "Work carefully." },
    ] };
    expect(projectSystemPrompt(prompt)).toBe(
      '<system from="plugin&quot;&lt;&amp;">\nRead &lt;resource&gt; &amp; continue.\n</system>\n\n<agent role="worker">\nWork carefully.\n</agent>',
    );
    expect(prompt.blocks[0]?.text).toBe("Read <resource> & continue.");
  });
  it("重新组装取代码中的 harness；局部替换不改变后续加载的内置定义", () => {
    const agent = { id: "worker", systemPrompt: "Role instructions" };
    const first = composeSystemPrompt(agent);
    const original = projectSystemPrompt(first);
    first.blocks[0]!.text = "Replaced by an extension";
    expect(projectSystemPrompt(first)).toContain("Replaced by an extension");
    const reloaded = composeSystemPrompt(agent);
    expect(projectSystemPrompt(reloaded)).toBe(original);
    expect(reloaded.blocks.map(block => block.kind)).toEqual(["system", "agent"]);
    expect(reloaded.blocks[1]).toMatchObject({ role: "worker", text: "Role instructions" });
  });
});
