import { describe, expect, it } from "vitest";
import type { Json } from "@atelier/sdk/contracts";
import { configurationField, configurationLabel, configurationProperty } from "./configuration-fields.ts";

describe("配置 schema 控件选择", () => {
  it("普通字段按明确类型显示，引用、联合和动态对象保留完整值编辑", () => {
    expect(configurationField({ type: "boolean" })).toEqual({ kind: "boolean" });
    expect(configurationField({ type: "integer", minimum: 0 })).toEqual({ kind: "integer" });
    const complex: Json[] = [{ $ref: "#/$defs/value" }, { anyOf: [{ type: "string" }, { type: "null" }] },
      { type: "object", properties: { a: { type: "string" } }, additionalProperties: { type: "number" } }];
    for (const schema of complex)
      expect(configurationField(schema)).toEqual({ kind: "json" });
    expect(configurationField({ type: "object", properties: { limit: { type: "number" } }, required: ["limit"], additionalProperties: false }))
      .toMatchObject({ kind: "object", required: ["limit"] });
    expect(configurationLabel({ title: "Limits" }, "limit")).toBe("Limits");
  });
  it("false、0、空字符串与 null 保持原类型，未设置只删除指定字段", () => {
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
