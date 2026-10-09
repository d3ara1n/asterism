import { createElement, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineData, present, reference } from "../../shared/presentation";
import { cardRenderer, resultRenderer, ViewRegistry } from "./registry";

const data = defineData("test.text", 1, z.strictObject({ text: z.string() }));
function Text({ data }: { data: { text: string } }) { return createElement("p", null, data.text); }
const result = resultRenderer(data, Text);
const card = cardRenderer(data, { label: "Text", icon: null, width: 340, connection: "source", Body: Text });

describe("视图契约分派", () => {
  it("按精确身份与版本选择组件，数据通过 schema 才进入组件", () => {
    const registry = new ViewRegistry([{ cards: [card], results: [result] }]);
    const node = registry.result(reference(data), { text: "saved" });
    expect(isValidElement(node) && node.type).toBe(Text);
    expect(registry.card(present(data, { text: "saved" }))?.label).toBe("Text");
    expect(registry.result({ id: data.id, version: 2 }, { text: "saved" })).toBeNull();
    expect(registry.result(undefined, { text: "saved" })).toBeNull();
    expect(registry.result(reference(data), { text: 7 })).toBeNull();
    expect(registry.card({ contract: reference(data), data: { text: 7 } })).toBeNull();
    expect(new ViewRegistry([]).card(present(data, { text: "saved" }))).toBeNull();
  });
  it("拒绝重复注册；旧版本可以和新版本共同展示历史", () => {
    expect(() => new ViewRegistry([{ cards: [card, card], results: [] }])).toThrow("Duplicate renderer");
    expect(() => new ViewRegistry([{ cards: [], results: [result, result] }])).toThrow("Duplicate renderer");
    const v2 = defineData(data.id, 2, z.strictObject({ content: z.string() }));
    const registry = new ViewRegistry([{ cards: [], results: [result, resultRenderer(v2, () => null)] }]);
    expect(registry.result(reference(data), { text: "old" })).not.toBeNull();
    expect(registry.result(reference(v2), { content: "new" })).not.toBeNull();
  });
});
