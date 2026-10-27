import { describe, expect, it } from "vitest";
import { defineProviderPresets, modelProviderPresetDraft } from "./provider-presets.ts";
import { modelProviderPresets } from "../../packages/builtin/src/providers/presets.ts";
import { canEditModelProviderField, modelProviderInputSchema } from "./configuration.ts";

describe("Provider connection presets", () => {
  // Presets combine configuration and editing rules; drafts must be independent without persistent preset identity.
  it("Kimi supplies fixed connection rules; drafts are independent and contain no catalog metadata", () => {
    const preset = modelProviderPresets.find(item => item.id === "kimi")!;
    const draft = modelProviderPresetDraft(preset);
    expect(draft).toEqual({
      id: "kimi", name: "Kimi", protocol: "openai-responses",
      baseUrl: "https://api.moonshot.ai/v1", auth: "api_key", usage: "kimi",
      compatibility: [{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }],
      fixedFields: ["protocol", "baseUrl", "auth", "compatibility", "usage"],
    });
    draft.compatibility[0]!.id = "systemMessageInMessages";
    draft.compatibility.push({ id: "toolFilesAsUserMessage" });
    draft.baseUrl = "https://example.test/v1";
    draft.fixedFields!.pop();
    expect(modelProviderPresetDraft(preset).compatibility).toEqual([{ id: "responsesReasoning", value: { encryptedContent: false, summary: false } }]);
    expect(modelProviderPresetDraft(preset).fixedFields).toEqual(["protocol", "baseUrl", "auth", "compatibility", "usage"]);
    expect(preset.connection.baseUrl).toBe("https://api.moonshot.ai/v1");
  });

  // Editing follows each connection's own rules; presets can fix selected fields without inference from names or endpoints.
  it("partially fixed and custom connections share field rules and unknown rules reject saving", () => {
    const preset = modelProviderPresets[0]!;
    const partial = modelProviderPresetDraft({ ...preset, connection: { ...preset.connection, fixedFields: ["protocol"] } });
    expect(canEditModelProviderField(partial, "protocol")).toBe(false);
    expect(canEditModelProviderField(partial, "baseUrl")).toBe(true);
    const custom = modelProviderInputSchema.parse({ ...partial, fixedFields: undefined, enabled: true });
    expect(canEditModelProviderField(custom, "protocol")).toBe(true);
    expect(canEditModelProviderField(custom, "compatibility")).toBe(true);
    expect(modelProviderInputSchema.safeParse({ ...custom, fixedFields: ["credential"] }).success).toBe(false);
    expect(modelProviderInputSchema.safeParse({ ...custom, fixedFields: ["auth", "auth"] }).success).toBe(false);
  });

  // Repeated additions of the same product must create new connection identities without overwriting existing keys or configuration.
  it("connection IDs avoid existing identities while regions and billing products remain independently declared", () => {
    const preset = modelProviderPresets[0]!;
    const occupied = ["openai", "openai-2", "openai-4"];
    expect(modelProviderPresetDraft(preset, occupied).id).toBe("openai-3");
    const subscription = { ...preset, id: "example-china-coding", name: "Example", region: "China", plan: "Coding Plan", billing: "subscription" as const };
    expect(defineProviderPresets([preset, subscription])).toHaveLength(2);
    expect(modelProviderPresetDraft(subscription, occupied).id).toBe("example-china-coding");
    expect(occupied).toEqual(["openai", "openai-2", "openai-4"]);
  });

  // Catalogs select presets by id; duplicate identities prevent reliable product distinction and must fail on declaration.
  it("catalogs reject duplicate preset identities", () => {
    expect(() => defineProviderPresets([modelProviderPresets[0]!, modelProviderPresets[0]!])).toThrow("Duplicate provider preset");
  });
});
