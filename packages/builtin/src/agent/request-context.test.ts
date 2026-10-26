import { describe, expect, it } from "vitest";
import { AgentRequestContext } from "@asterism/builtin-api/contracts";
import { agentRequestExtensions } from "./request-context.ts";

describe("Agent 请求上下文扩展", () => {
  // docs/runtime.md：按 Unicode 码点保存分区字数和实际声明名称，不持久化提示正文或工具 schema。
  it("保存来源与码点计量，领域扩展省略原始正文", () => {
    const [extension] = agentRequestExtensions({
      system: { blocks: [
        { id: "s", kind: "system", from: "core", text: "环境😀" },
        { id: "a", kind: "agent", role: "worker", text: "role" },
        { id: "c", kind: "context", file: "/work/AGENTS.md", text: "中文" },
      ] },
      tools: [{ name: "resource_list", description: "List resources.", parameters: { type: "object" } }],
    });
    expect(extension).toEqual({ contract: { id: AgentRequestContext.id }, data: {
      system: [
        { kind: "system", from: "core", characters: 3 },
        { kind: "agent", role: "worker", characters: 4 },
        { kind: "context", file: "/work/AGENTS.md", characters: 2 },
      ],
      tools: ["resource_list"],
    } });
  });
});
