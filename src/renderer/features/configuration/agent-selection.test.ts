import { describe, expect, it } from "vitest";
import type { ConfigurationSnapshot } from "../../../shared/configuration.ts";
import { defaultAgents, defaultRoles } from "../../../configuration/defaults.ts";
import { initialAgentSelection } from "./agent-selection.ts";

function configuration(): ConfigurationSnapshot {
  return {
    agents: defaultAgents.map(agent => ({ ...agent, revision: 1 })),
    roles: defaultRoles.map(role => ({ ...role, revision: 1 })),
    providers: [{ id: "p", revision: 1, name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid",
      enabled: true, auth: "none", credentialState: "not_required" }],
    models: [{ revision: 1, providerId: "p", name: "Test", modelId: "test", enabled: true, contextWindow: null,
      capabilities: { reasoning: true, tools: true }, generation: { temperature: null, topP: null, maxOutputTokens: null } }],
    defaults: { agents: {}, roles: {} }, overrides: { agents: {}, roles: {} }, tests: [], credentialStorageAvailable: false,
  };
}

describe("创建前代理选择", () => {
  it.each(["role_unavailable", "model_unavailable", "empty"] as const)("切换到 %s 默认配置时不沿用上一代理的模型", state => {
    const config = configuration();
    const normal = config.roles.find(role => role.id === "default")!;
    normal.model = "p/test"; normal.thinking = "high";
    expect(initialAgentSelection(config, "worker")).toMatchObject({ modelId: "p/test", thinking: "high", error: null });
    const fast = config.roles.find(role => role.id === "fast")!;
    fast.thinking = null;
    fast.enabled = state !== "role_unavailable";
    fast.model = state === "model_unavailable" ? "p/missing" : null;
    expect(initialAgentSelection(config, "explorer")).toMatchObject({
      agentId: "explorer", modelId: null, thinking: null, error: state === "empty" ? null : state,
    });
  });
});
