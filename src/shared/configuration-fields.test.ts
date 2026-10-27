import { describe, expect, it } from "vitest";
import type { Json } from "@asterism/sdk/contracts";
import { configurationField, configurationLabel, configurationProperty } from "./configuration-fields.ts";

describe("Configuration schema control selection", () => {
  it("ordinary fields use explicit types while references, unions, and dynamic objects retain full-value editing", () => {
    expect(configurationField({ type: "boolean" })).toEqual({ kind: "boolean" });
    expect(configurationField({ type: "integer", minimum: 0 })).toEqual({ kind: "integer" });
    const complex: Json[] = [{ $ref: "#/$defs/value" }, { anyOf: [{ type: "string" }, { type: "number" }] },
      { type: "object", properties: { a: { type: "string" } }, additionalProperties: { type: "number" } }];
    for (const schema of complex)
      expect(configurationField(schema)).toEqual({ kind: "json" });
    expect(configurationField({ type: "object", properties: { limit: { type: "number" } }, required: ["limit"], additionalProperties: false }))
      .toMatchObject({ kind: "object", required: ["limit"] });
    expect(configurationLabel({ title: "Limits" }, "limit")).toBe("Limits");
    // Level mappings distinguish omission, null, and strings; recognizing nullable must preserve input constraints.
    expect(configurationField({ anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }))
      .toEqual({ kind: "nullable-string", schema: { type: "string", minLength: 1 } });
  });
  it("false, 0, empty strings, and null retain original types and unset removes only the specified field", () => {
    const original = { limit: 5, enabled: true, label: "Name", timeout: 1 };
    expect(configurationProperty(original, "limit", 0)).toMatchObject({ limit: 0 });
    expect(configurationProperty(original, "enabled", false)).toMatchObject({ enabled: false });
    expect(configurationProperty(original, "label", "")).toMatchObject({ label: "" });
    expect(configurationProperty(original, "timeout", null)).toMatchObject({ timeout: null });
    expect(configurationProperty(original, "timeout", undefined)).toEqual({ limit: 5, enabled: true, label: "Name" });
    expect(original.timeout).toBe(1);
    expect(configurationField({ enum: [false, 0, "", null] })).toEqual({ kind: "enum", options: [false, 0, "", null] });
    expect(configurationField({ const: false })).toEqual({ kind: "enum", options: [false] });
  });
});
