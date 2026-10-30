import { expect, it } from "vitest";
import storage from "./storage.ts";
import { BuiltinSettings } from "./settings/contract.ts";
import { resolveParadigmConfiguration } from "./configuration/state.ts";

const configuration = storage.find(item => item.kind === "json")!;
if (configuration.kind !== "json") throw new Error("Missing configuration storage.");

// Old overrides must retain their values and inheritance rather than fail decoding and fall back to defaults.
it("moves version 3 budget overrides into subagent settings while preserving unrelated overrides", () => {
  const previous = {
    autoExpand: false,
    autoCollapse: true,
    paradigm: {
      roles: [{ id: "default", builtin: true, overrides: { thinking: "high" } }],
      agents: [
        { id: "worker", builtin: true, overrides: { systemPrompt: "  User instructions\n", budget: { maxRequests: 17 }, enabled: false, examples: [] } },
        { id: "custom", builtin: false, overrides: { budget: { maxDurationSeconds: 75 }, description: "Custom role" } },
        { id: "explorer", builtin: true, overrides: {} },
      ],
    },
  };
  const migrated = configuration.migrations[3]!(previous);
  expect(migrated).toEqual({
    autoExpand: false,
    autoCollapse: true,
    paradigm: {
      roles: [{ id: "default", builtin: true, overrides: { thinking: "high" } }],
      agents: [
        { id: "worker", builtin: true, overrides: { systemPrompt: "  User instructions\n", subagent: { budget: { maxRequests: 17 } }, enabled: false, examples: [] } },
        { id: "custom", builtin: false, overrides: { subagent: { budget: { maxDurationSeconds: 75 } }, description: "Custom role" } },
        { id: "explorer", builtin: true, overrides: {} },
      ],
    },
  });
  const effective = resolveParadigmConfiguration(BuiltinSettings.schema.parse(migrated).paradigm);
  expect(effective.agents[0]).toMatchObject({
    systemPrompt: "  User instructions\n", subagent: { budget: { maxRequests: 17, maxDurationSeconds: 2400 } },
  });
  expect(effective.agents[1]).toMatchObject({ subagent: { budget: { maxRequests: 4096, maxDurationSeconds: 75 } } });
  expect(previous.paradigm.agents[0]!.overrides).toHaveProperty("budget", { maxRequests: 17 });
});

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
  const migrated = configuration.migrations[2]!(previous);
  expect(migrated).toEqual({
    autoExpand: false, autoCollapse: true,
    paradigm: {
      roles: [{ id: "default", builtin: true, overrides: { model: "provider/model", thinking: "high" } }],
      agents: [{ id: "custom", builtin: false, overrides: {
        systemPrompt: "Investigate the supplied task.", modelRole: "default", enabled: false,
      } }],
    },
  });
  expect(configuration.migrations[3]!(migrated)).toEqual(migrated);
  expect(previous.paradigm.agents[0]!.overrides.tools).toEqual(["read"]);
});

it("preserves saved settings that inherit the entire default paradigm", () => {
  expect(configuration.migrations[2]!({ autoExpand: false })).toEqual({ autoExpand: false });
  expect(configuration.migrations[3]!({ autoExpand: false })).toEqual({ autoExpand: false });
});
