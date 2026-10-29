import { describe, expect, it } from "vitest";
import { defineProviderPresets, modelProviderPresetDraft, type ModelProviderPreset } from "./provider-presets.ts";
import { canEditModelProviderField } from "./configuration.ts";

const preset: ModelProviderPreset = {
  id: "example", name: "Example", billing: "none", sources: ["https://example.test/docs"], verifiedOn: "2026-10-20",
  connection: { protocol: "openai-chat", baseUrl: "https://example.test/v1", auth: "none", compatibility: [] },
};

describe("Provider connection presets", () => {
  // Editing follows each connection's own rules; presets can fix selected fields without inference from names or endpoints.
  it("partially fixed connections restrict only their declared fields", () => {
    const partial = modelProviderPresetDraft({ ...preset, connection: { ...preset.connection, fixedFields: ["protocol"] } });
    expect(canEditModelProviderField(partial, "protocol")).toBe(false);
    expect(canEditModelProviderField(partial, "baseUrl")).toBe(true);
    const custom = { ...partial, fixedFields: undefined };
    expect(canEditModelProviderField(custom, "protocol")).toBe(true);
    expect(canEditModelProviderField(custom, "compatibility")).toBe(true);
  });

  // Repeated additions of the same product must create new connection identities without overwriting existing keys or configuration.
  it("connection IDs fill the first available suffix without changing occupied identities", () => {
    const occupied = ["example", "example-2", "example-4"];
    expect(modelProviderPresetDraft(preset, occupied).id).toBe("example-3");
    expect(occupied).toEqual(["example", "example-2", "example-4"]);
  });

  // Catalogs select presets by id; duplicate identities prevent reliable product distinction and must fail on declaration.
  it("catalogs reject duplicate preset identities", () => {
    expect(() => defineProviderPresets([preset, preset])).toThrow("Duplicate provider preset");
  });
});
