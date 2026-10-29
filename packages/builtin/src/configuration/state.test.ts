import { describe, expect, it } from "vitest";
import { defaultParadigmConfiguration, resolveParadigmConfiguration } from "./state.ts";
import { updateParadigmConfiguration, resolveRoleTarget } from "./runtime.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";

const initial = () => structuredClone(defaultParadigmConfiguration);
describe("Builtin configuration ownership", () => {
  it("keeps explicit false and empty lists while clearing blank overrides to the original baseline", () => {
    const saved = updateParadigmConfiguration(initial(), { type: "agent.save", id: "worker", value: {
      id: "worker", systemPrompt: "Custom instructions", enabled: false, tools: [], subagentRoles: [],
    } });
    expect(resolveParadigmConfiguration(saved).agents.find(agent => agent.id === "worker"))
      .toMatchObject({ systemPrompt: "Custom instructions", enabled: false, tools: [], subagentRoles: [] });
    const cleared = updateParadigmConfiguration(saved, { type: "agent.save", id: "worker", value: { id: "worker", systemPrompt: " \n " } });
    expect(resolveParadigmConfiguration(cleared).overrides.agents.worker).toEqual({});
    expect(resolveParadigmConfiguration(cleared).agents.find(agent => agent.id === "worker")!.systemPrompt).toBe(configurationDefaults.agents.worker!.systemPrompt);
    expect(saved.agents.find(agent => agent.id === "worker")!.overrides.systemPrompt).toBe("Custom instructions");
  });
  it("uses original defaults for custom entries and treats tool policy as one replacement group", () => {
    let value = updateParadigmConfiguration(initial(), { type: "agent.save", id: "worker", value: { id: "worker", systemPrompt: "Changed", enabled: false } });
    value = updateParadigmConfiguration(value, { type: "remove", kind: "agent", id: "worker" });
    value = updateParadigmConfiguration(value, { type: "agent.save", id: null, value: { id: "custom", tools: [] } });
    expect(resolveParadigmConfiguration(value).agents.find(agent => agent.id === "custom"))
      .toMatchObject({ systemPrompt: configurationDefaults.agents.worker!.systemPrompt, enabled: true, tools: [] });
    value = updateParadigmConfiguration(value, { type: "agent.save", id: "explorer", value: { id: "explorer", excludeTools: ["bash"] } });
    expect(resolveParadigmConfiguration(value).agents.find(agent => agent.id === "explorer")).toMatchObject({ tools: null, excludeTools: ["bash"] });
    value = updateParadigmConfiguration(value, { type: "agent.save", id: "explorer", value: { id: "explorer", tools: [] } });
    expect(resolveParadigmConfiguration(value).agents.find(agent => agent.id === "explorer")).toMatchObject({ tools: [], excludeTools: null });
  });
  it("rejects duplicate identities and preserves overrides through a custom rename", () => {
    const created = updateParadigmConfiguration(initial(), { type: "role.save", id: null, value: { id: "review", description: "Review code" } });
    expect(() => updateParadigmConfiguration(created, { type: "role.save", id: null, value: { id: "review" } })).toThrow("already used");
    const renamed = updateParadigmConfiguration(created, { type: "role.save", id: "review", value: { id: "review-code", description: "Review code" } });
    expect(resolveParadigmConfiguration(renamed).roles.find(role => role.id === "review-code")).toMatchObject({ builtin: false, description: "Review code" });
    expect(renamed.roles.some(role => role.id === "review")).toBe(false);
    expect(() => updateParadigmConfiguration(renamed, { type: "role.save", id: "default", value: { id: "renamed" } })).toThrow("fixed");
  });
  it("resolves role inheritance before calling the host and keeps a captured target stable across role edits", () => {
    const roles = resolveParadigmConfiguration(initial()).roles;
    const role = roles.find(role => role.id === "default")!;
    role.model = "provider/model"; role.thinking = "high";
    const target = resolveRoleTarget(roles, "default");
    role.thinking = "low";
    expect(target).toEqual({ provider: "provider", model: "model", thinking: "high" });
    expect(resolveRoleTarget(roles, "default")).toEqual({ provider: "provider", model: "model", thinking: "low" });
    expect(resolveRoleTarget(roles, "default", { model: "other/model", thinking: "off" })).toEqual({ provider: "other", model: "model", thinking: "off" });
    role.enabled = false;
    expect(() => resolveRoleTarget(roles, "default", { model: "other/model" })).toThrow("unavailable");
    expect(() => resolveRoleTarget(roles, "utility")).toThrow("no configured model");
  });
  it("updates unoverridden fields without mutating already resolved configuration", () => {
    const oldDefaults = structuredClone(configurationDefaults), nextDefaults = structuredClone(configurationDefaults);
    oldDefaults.agents.worker!.maxTurns = 1200; nextDefaults.agents.worker!.maxTurns = 3000;
    nextDefaults.agents.worker!.systemPrompt = "New default"; nextDefaults.roles.default!.thinking = "high";
    const entry = { id: "custom", builtin: false, overrides: { systemPrompt: "Pinned" } };
    const before = resolveAgentConfiguration(entry, oldDefaults);
    expect(resolveAgentConfiguration(entry, nextDefaults)).toMatchObject({ maxTurns: 3000, systemPrompt: "Pinned" });
    expect(before.maxTurns).toBe(1200);
    expect(resolveRoleConfiguration({ id: "role", builtin: false, overrides: { hidden: false } }, nextDefaults)).toMatchObject({ thinking: "high", hidden: false });
  });
});
