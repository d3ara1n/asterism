import { describe, expect, it } from "vitest";
import storage from "./storage.ts";

describe("Builtin settings migration", () => {
  // Removing obsolete Agent fields must not reset model assignments or unrelated customized settings.
  it("removes Agent policies and the workbench request limit while preserving role models, prompts, and presentation settings", () => {
    const previous = {
      autoExpand: false, autoCollapse: true,
      paradigm: {
        roles: [{ id: "default", builtin: true, overrides: { model: "provider/model", thinking: "high" } }],
        agents: [{ id: "custom", builtin: false, overrides: {
          systemPrompt: "Investigate the supplied task.", modelRole: "default", maxTurns: 7, enabled: false,
          tools: ["read"], excludeTools: null, subagentRoles: ["explorer"], fallbackRole: "fast",
        } }],
      },
    };
    const declaration = storage.find(item => item.kind === "json")!;
    if (declaration.kind !== "json") throw new Error("Missing settings migration.");
    expect(declaration.migrations[2]!(previous)).toEqual({
      autoExpand: false, autoCollapse: true,
      paradigm: {
        roles: [{ id: "default", builtin: true, overrides: { model: "provider/model", thinking: "high" } }],
        agents: [{ id: "custom", builtin: false, overrides: {
          systemPrompt: "Investigate the supplied task.", modelRole: "default", enabled: false,
        } }],
      },
    });
    expect(previous.paradigm.agents[0]!.overrides.tools).toEqual(["read"]);
  });
  it("preserves saved settings that inherit the entire default paradigm", () => {
    const declaration = storage.find(item => item.kind === "json")!;
    if (declaration.kind !== "json") throw new Error("Missing settings migration.");
    expect(declaration.migrations[2]!({ autoExpand: false })).toEqual({ autoExpand: false });
  });
});
