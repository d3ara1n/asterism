import { describe, expect, it } from "vitest";
import { projectConfigurationPresentation, pointerChild } from "./configuration-presentation.ts";
import type { Json } from "@atelier/sdk/contracts";
const schema: Json = { type: "object", properties: {
  "a/b~c": { type: "object", properties: { choice: { enum: [1, "1"] } }, required: ["choice"] },
  array: { type: "array", items: { type: "string" } }, optional: { type: "object", properties: { hidden: { type: "string" } } },
}, required: ["a/b~c", "array"], additionalProperties: false };
describe("配置展示的固定 JSON Pointer", () => {
  it("指针转义与枚举按原始值区分，复杂或不可达字段仅诊断后忽略", () => {
    const diagnostics: string[] = [];
    const result = projectConfigurationPresentation(schema, { fields: {
      "": { title: "Settings" }, "/a~1b~0c/choice": { enumLabels: [{ value: 1, label: "Number" }, { value: "1", label: "Text" }, { value: 1, label: "Duplicate" }, { value: 2, label: "Extra" }] },
      "/array": { description: "JSON array" }, "/array/0": { title: "Not reachable" }, "/optional/hidden": { title: "Not reachable" },
    } }, message => diagnostics.push(message));
    expect(pointerChild("", "a/b~c")).toBe("/a~1b~0c");
    expect(result!.fields["/a~1b~0c/choice"]!.enumLabels).toEqual([{ value: 1, label: "Number" }, { value: "1", label: "Text" }]);
    expect(new Set(Object.keys(result!.fields))).toEqual(new Set(["", "/a~1b~0c/choice", "/array"]));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(schema).not.toHaveProperty("title");
  });
});
