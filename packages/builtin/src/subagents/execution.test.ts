import { describe, expect, it } from "vitest";
import { defaultAgents, defaultRoles } from "../configuration/defaults.ts";
import { accumulateUsage, resolveTask } from "./execution.ts";

describe("Subagent model selection", () => {
  it("uses the default model for an empty selected ModelRole while keeping its thinking level", () => {
    const configuration = { agents: structuredClone(defaultAgents), roles: structuredClone(defaultRoles) };
    configuration.roles.find(role => role.id === "default")!.model = "provider/general";
    expect(resolveTask(configuration, { role: "reviewer" }).target).toEqual({ provider: "provider", model: "general", thinking: "high" });
    configuration.roles.find(role => role.id === "heavy")!.model = "provider/review";
    expect(resolveTask(configuration, { role: "reviewer" }).target.model).toBe("review");
    expect(resolveTask(configuration, { role: "reviewer", model: "other/explicit" }).target)
      .toEqual({ provider: "other", model: "explicit", thinking: "high" });
  });
  it("reports missing configuration and never substitutes an unavailable AgentRole or ModelRole", () => {
    const configuration = { agents: structuredClone(defaultAgents), roles: structuredClone(defaultRoles) };
    expect(() => resolveTask(configuration, { role: "explorer" })).toThrow("no configured model");
    expect(() => resolveTask(configuration, { role: "missing", model: "provider/model" })).toThrow("Agent role missing");
    configuration.roles.find(role => role.id === "fast")!.enabled = false;
    expect(() => resolveTask(configuration, { role: "explorer", model: "provider/model" })).toThrow("Model role fast");
  });
  it("does not report partial token measurements as known totals", () => {
    const first = { input: 10, output: 4, total: 14, reasoning: null, cacheRead: 0, cacheWrite: null };
    expect(accumulateUsage(first, { input: 5, output: null, total: null, reasoning: 1, cacheRead: 2, cacheWrite: null }, false))
      .toEqual({ input: 15, output: null, total: null, reasoning: null, cacheRead: 2, cacheWrite: null });
  });
});
