import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defaultParadigmConfiguration, resolveParadigmConfiguration } from "./state.ts";
import { updateParadigmConfiguration, resolveRoleTarget, selectAgentForModel } from "./runtime.ts";
import { createSelection } from "../agent/selection.ts";
import { paradigmConfigurationSchema } from "./contract.ts";
import { configurationDefaults, resolveAgentConfiguration, resolveRoleConfiguration } from "./layers.ts";

const initial = () => structuredClone(defaultParadigmConfiguration);
describe("Builtin configuration ownership", () => {
  it("combines saved overrides and additions with new built-ins without changing the saved default or overrides", () => {
    const saved = {
      roles: [{ id: "default", builtin: true, overrides: { model: "provider/model" } }],
      agents: [
        { id: "worker", builtin: true, overrides: { systemPrompt: "User instructions", enabled: false } },
        { id: "custom", builtin: false, overrides: { subagent: { budget: { maxRequests: 17 } }, delegates: [] } },
      ],
    };
    const decoded = paradigmConfigurationSchema.parse(saved);
    const snapshot = resolveParadigmConfiguration(decoded);
    expect(decoded).toEqual({ ...saved, defaultAgentId: "worker" });
    expect(snapshot.defaultAgentId).toBe("worker");
    expect(snapshot.agents.filter(agent => ["general", "worker", "custom"].includes(agent.id)).map(agent => agent.id)).toEqual(["general", "worker", "custom"]);
    expect(snapshot.agents.find(agent => agent.id === "general")).toMatchObject({ builtin: true, systemPrompt: "", availableToAgents: false });
    expect(snapshot.agents.find(agent => agent.id === "worker")).toMatchObject({ systemPrompt: "User instructions", enabled: false, availableToAgents: true });
    expect(snapshot.agents.find(agent => agent.id === "custom")).toMatchObject({ systemPrompt: "General-purpose agent. Carry out the requested task using the available context and capabilities.",
      availableToAgents: true, delegates: [], subagent: { budget: { maxRequests: 17, maxDurationSeconds: 2400 } } });
    expect(snapshot.overrides.agents).toEqual(Object.fromEntries(saved.agents.map(agent => [agent.id, agent.overrides])));
    const explicit = resolveParadigmConfiguration(paradigmConfigurationSchema.parse({ ...saved, defaultAgentId: "custom" }));
    expect(explicit.defaultAgentId).toBe("custom");
  });

  it("treats unknown, disabled, and user-only roles identically for a model's new selection", () => {
    const configuration = resolveParadigmConfiguration(initial());
    const role = configuration.agents.find(agent => agent.id === "general")!;
    const failure = (agents: typeof configuration.agents) => {
      try { selectAgentForModel(agents, "general"); return null; }
      catch (error) {
        const value = error as { code: string; message: string };
        return { code: value.code, message: value.message };
      }
    };
    const missing = { code: "not_found", message: "Agent role general is unavailable." };
    expect(failure([])).toEqual(missing);
    expect(failure([role])).toEqual(missing);
    expect(failure([{ ...role, enabled: false, availableToAgents: true }])).toEqual(missing);
    expect(selectAgentForModel([{ ...role, availableToAgents: true }], "general").id).toBe("general");
  });

  it("keeps an existing workbench selection usable after closing its role to new model selections", () => {
    const configuration = resolveParadigmConfiguration(initial());
    configuration.roles.find(role => role.id === "default")!.model = "provider/conversation";
    const role = configuration.agents.find(agent => agent.id === "general")!;
    role.availableToAgents = true;
    const selection = { agent: "general", model: null, thinking: null };
    const service = createSelection({ agents: () => configuration.agents, roles: () => configuration.roles });
    service.validate(selection);
    role.availableToAgents = false;
    service.validate(selection, selection);
    expect(service.target(selection)).toEqual({ provider: "provider", model: "conversation", thinking: "medium" });
  });

  it("preserves model choices across settings reads and writes while dropping retired role visibility", () => {
    const saved = { defaultAgentId: "general", roles: [{ id: "utility", builtin: true,
      overrides: { hidden: true, model: "provider/utility", thinking: "low" } }], agents: [] };
    const decoded = paradigmConfigurationSchema.parse(saved);
    const encoded = z.encode(paradigmConfigurationSchema, decoded);
    const configuration = resolveParadigmConfiguration(paradigmConfigurationSchema.parse(encoded));
    expect(resolveRoleTarget(configuration.roles, "utility")).toEqual({ provider: "provider", model: "utility", thinking: "low" });
  });

  it("keeps explicit false and empty lists while clearing blank overrides to the original baseline", () => {
    const saved = updateParadigmConfiguration(initial(), { type: "agent.save", id: "general", value: {
      id: "general", systemPrompt: "Custom instructions", enabled: false, examples: [], delegates: [],
    } });
    expect(resolveParadigmConfiguration(saved).agents.find(agent => agent.id === "general"))
      .toMatchObject({ systemPrompt: "Custom instructions", enabled: false, examples: [], delegates: [] });
    const cleared = updateParadigmConfiguration(saved, { type: "agent.save", id: "general", value: { id: "general", systemPrompt: " \n " } });
    expect(resolveParadigmConfiguration(cleared).overrides.agents.general).toEqual({});
    expect(resolveParadigmConfiguration(cleared).agents.find(agent => agent.id === "general")!.systemPrompt).toBe(configurationDefaults.agents.general!.systemPrompt);
    expect(saved.agents.find(agent => agent.id === "general")!.overrides.systemPrompt).toBe("Custom instructions");
  });
  it("uses original defaults for custom entries independently of edited built-ins", () => {
    let value = updateParadigmConfiguration(initial(), { type: "agent.save", id: "general", value: { id: "general", systemPrompt: "Changed", enabled: false } });
    value = updateParadigmConfiguration(value, { type: "agent.save", id: null, value: { id: "custom", examples: [] } });
    expect(resolveParadigmConfiguration(value).agents.find(agent => agent.id === "custom"))
      .toMatchObject({ systemPrompt: configurationDefaults.agents.worker!.systemPrompt, enabled: true, examples: [] });
  });
  it.each(["agent", "role"] as const)("edits code-owned %s entries without stored roster entries and rejects deletion or identity collisions", kind => {
    const id = kind === "agent" ? "general" : "default";
    const save = kind === "agent" ? "agent.save" : "role.save";
    const empty = initial();
    const changed = updateParadigmConfiguration(empty, { type: save, id, value: { id, enabled: false, description: "User purpose" } });
    const entries = (value: ReturnType<typeof initial>) => {
      const snapshot = resolveParadigmConfiguration(value);
      return kind === "agent" ? snapshot.agents : snapshot.roles;
    };
    expect(entries(changed).filter(entry => entry.id === id)).toMatchObject([{ builtin: true, enabled: false, description: "User purpose" }]);
    expect(entries(empty).find(entry => entry.id === id)?.enabled).toBe(true);
    expect(() => updateParadigmConfiguration(empty, { type: "remove", kind, id })).toThrow("cannot be deleted");
    expect(() => updateParadigmConfiguration(changed, { type: "remove", kind, id })).toThrow("cannot be deleted");
    expect(() => updateParadigmConfiguration(empty, { type: save, id, value: { id: "renamed" } })).toThrow("fixed");
    expect(() => updateParadigmConfiguration(empty, { type: save, id: null, value: { id } })).toThrow("already used");
    const added = updateParadigmConfiguration(changed, { type: save, id: null, value: { id: "custom", description: "Custom purpose" } });
    expect(() => updateParadigmConfiguration(added, { type: save, id: "custom", value: { id } })).toThrow("already used");
    const removed = updateParadigmConfiguration(added, { type: "remove", kind, id: "custom" });
    expect(entries(removed).some(entry => entry.id === "custom")).toBe(false);
    const restored = updateParadigmConfiguration(removed, { type: save, id, value: { id } });
    expect(entries(restored).find(entry => entry.id === id)).toEqual(entries(empty).find(entry => entry.id === id));
  });

  it("takes built-in identity from code and merges a saved roster without duplicating entries or losing disabled overrides", () => {
    const saved = initial();
    saved.roles = [{ id: "fast", builtin: false, overrides: { enabled: false, model: "provider/fast" } }];
    saved.agents = [{ id: "explorer", builtin: false, overrides: { enabled: false, systemPrompt: "Custom exploration" } }];
    const snapshot = resolveParadigmConfiguration(saved);
    expect(snapshot.roles.filter(role => role.id === "fast")).toMatchObject([{ builtin: true, enabled: false, model: "provider/fast" }]);
    expect(snapshot.agents.filter(agent => agent.id === "explorer")).toMatchObject([{ builtin: true, enabled: false, systemPrompt: "Custom exploration" }]);
    expect(() => updateParadigmConfiguration(saved, { type: "remove", kind: "agent", id: "explorer" })).toThrow("cannot be deleted");
    expect(saved.agents[0]?.builtin).toBe(false);
  });

  it("rejects duplicate identities and preserves overrides through a custom rename", () => {
    const created = updateParadigmConfiguration(initial(), { type: "role.save", id: null, value: { id: "review", description: "Review code" } });
    expect(() => updateParadigmConfiguration(created, { type: "role.save", id: null, value: { id: "review" } })).toThrow("already used");
    const renamed = updateParadigmConfiguration(created, { type: "role.save", id: "review", value: { id: "review-code", description: "Review code" } });
    expect(resolveParadigmConfiguration(renamed).roles.find(role => role.id === "review-code")).toMatchObject({ builtin: false, description: "Review code" });
    expect(renamed.roles.some(role => role.id === "review")).toBe(false);
    expect(() => updateParadigmConfiguration(renamed, { type: "role.save", id: "default", value: { id: "renamed" } })).toThrow("fixed");
  });
  it("accepts an enabled default and rejects unavailable choices without replacing it", () => {
    const created = updateParadigmConfiguration(initial(), { type: "agent.save", id: null, value: { id: "custom" } });
    const selected = updateParadigmConfiguration(created, { type: "agent.default", id: "custom" });
    const disabled = updateParadigmConfiguration(selected, { type: "agent.save", id: "general", value: { id: "general", enabled: false } });
    expect(() => updateParadigmConfiguration(disabled, { type: "agent.default", id: "general" })).toThrow("unavailable");
    expect(() => updateParadigmConfiguration(disabled, { type: "agent.default", id: "missing" })).toThrow("unavailable");
    expect(disabled.defaultAgentId).toBe("custom");
    expect(created.defaultAgentId).toBe("general");
  });
  it.each(["disable", "rename", "delete"] as const)("preserves the explicit default ID when its target is changed: %s", change => {
    const created = updateParadigmConfiguration(initial(), { type: "agent.save", id: null, value: { id: "custom" } });
    const selected = updateParadigmConfiguration(created, { type: "agent.default", id: "custom" });
    const changed = updateParadigmConfiguration(selected, change === "delete"
      ? { type: "remove", kind: "agent", id: "custom" }
      : { type: "agent.save", id: "custom", value: { id: change === "rename" ? "renamed" : "custom", enabled: change !== "disable" } });
    const snapshot = resolveParadigmConfiguration(changed);
    expect(snapshot.defaultAgentId).toBe("custom");
    expect(snapshot.agents.find(agent => agent.id === snapshot.defaultAgentId && agent.enabled)).toBeUndefined();
    const restored = updateParadigmConfiguration(changed, { type: "agent.default", id: "general" });
    expect(resolveParadigmConfiguration(restored).defaultAgentId).toBe("general");
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
    oldDefaults.agents.worker!.subagent.budget.maxRequests = 1200; nextDefaults.agents.worker!.subagent.budget.maxRequests = 3000;
    nextDefaults.agents.worker!.subagent.budget.maxDurationSeconds = 50;
    nextDefaults.agents.worker!.subagent.instructions = "New delegation instructions";
    nextDefaults.agents.worker!.systemPrompt = "New default"; nextDefaults.roles.default!.thinking = "high";
    // Overriding one budget field keeps inheriting the other from current defaults.
    const entry = { id: "custom", builtin: false, overrides: { systemPrompt: "Pinned", subagent: { budget: { maxDurationSeconds: 70 } } } };
    const before = resolveAgentConfiguration(entry, oldDefaults);
    expect(resolveAgentConfiguration(entry, nextDefaults)).toMatchObject({
      subagent: { instructions: "New delegation instructions", budget: { maxRequests: 3000, maxDurationSeconds: 70 } }, systemPrompt: "Pinned",
    });
    expect(before.subagent.budget.maxRequests).toBe(1200);
    expect(resolveRoleConfiguration({ id: "role", builtin: false, overrides: { thinking: "off" } }, nextDefaults)).toMatchObject({ thinking: "off" });
  });
  it("clears nested blank instructions and empty budgets while preserving sibling overrides", () => {
    const saved = updateParadigmConfiguration(initial(), { type: "agent.save", id: "general", value: {
      id: "general", systemPrompt: "Shared", subagent: { instructions: " \n ", budget: { maxRequests: 8 } },
    } });
    expect(saved.agents.find(agent => agent.id === "general")!.overrides)
      .toEqual({ systemPrompt: "Shared", subagent: { budget: { maxRequests: 8 } } });
    const instructions = updateParadigmConfiguration(saved, { type: "agent.save", id: "general", value: {
      id: "general", subagent: { instructions: "Delegated", budget: {} },
    } });
    expect(instructions.agents.find(agent => agent.id === "general")!.overrides)
      .toEqual({ subagent: { instructions: "Delegated" } });
    const cleared = updateParadigmConfiguration(instructions, { type: "agent.save", id: "general", value: {
      id: "general", subagent: { instructions: " ", budget: {} },
    } });
    expect(cleared.agents.find(agent => agent.id === "general")!.overrides).toEqual({});
  });
  it("replaces inherited resource policies as a pair and preserves empty allowlists", () => {
    const defaults = structuredClone(configurationDefaults);
    defaults.agents.worker!.excludeResources = ["test/web"];
    const resolve = (overrides: Parameters<typeof resolveAgentConfiguration>[0]["overrides"]) =>
      resolveAgentConfiguration({ id: "custom", builtin: false, overrides }, defaults);
    expect(resolve({})).toMatchObject({ resources: null, excludeResources: ["test/web"] });
    expect(resolve({ resources: ["test/files"] })).toMatchObject({ resources: ["test/files"], excludeResources: null });
    expect(resolve({ resources: [] })).toMatchObject({ resources: [], excludeResources: null });
    expect(resolve({ excludeResources: null })).toMatchObject({ resources: null, excludeResources: null });
  });
});
