import { describe, expect, it } from "vitest";
import { AgentRequestContext } from "@asterism-app/builtin-api/contracts";
import { agentRequestExtensions } from "./request-context.ts";

describe("Agent request context extensions", () => {
  // Saves section character counts as Unicode code points and actual declared names, without persisting prompt bodies or tool schemas.
  it("Saves source and code-point measurements while domain extensions omit original body text", () => {
    const [extension] = agentRequestExtensions([
        { id: "s", source: { id: "s", plugin: "core" }, kind: "system", from: "core", text: "环境😀" },
        { id: "a", source: { id: "a", plugin: "builtin" }, kind: "agent", role: "worker", text: "role" },
        { id: "c", source: { id: "c", plugin: null }, kind: "context", file: "/work/AGENTS.md", text: "中文" },
      ], { system: { blocks: [] },
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
