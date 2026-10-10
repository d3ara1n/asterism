import { createElement, isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, present, reference } from "../../shared/presentation";
import { cardRenderer, resultRenderer, ViewRegistry } from "./registry";

const data = defineData("test.text", 1, z.strictObject({ text: z.string() }));
function Text({ data }: { data: { text: string } }) { return createElement("p", null, data.text); }
const result = resultRenderer(data, Text);
const card = cardRenderer(data, { width: 340, Body: Text });

describe("视图契约分派", () => {
  it("按精确身份与版本选择组件，数据通过 schema 才进入组件", () => {
    const registry = new ViewRegistry([{ resources: [], cards: [card], results: [result] }]);
    const node = registry.result(reference(data), { text: "saved" });
    expect(isValidElement(node) && node.type).toBe(Text);
    expect(registry.card(present(data, { text: "saved" }))?.width).toBe(340);
    expect(registry.result({ id: data.id, version: 2 }, { text: "saved" })).toBeNull();
    expect(registry.result(undefined, { text: "saved" })).toBeNull();
    expect(registry.result(reference(data), { text: 7 })).toBeNull();
    expect(registry.card({ contract: reference(data), data: { text: 7 } })).toBeNull();
    expect(new ViewRegistry([]).card(present(data, { text: "saved" }))).toBeNull();
  });
  it("拒绝重复注册；旧版本可以和新版本共同展示历史", () => {
    expect(() => new ViewRegistry([{ resources: [], cards: [card, card], results: [] }])).toThrow("Duplicate renderer");
    expect(() => new ViewRegistry([{ resources: [], cards: [], results: [result, result] }])).toThrow("Duplicate renderer");
    const v2 = defineData(data.id, 2, z.strictObject({ content: z.string() }));
    const registry = new ViewRegistry([{ resources: [], cards: [], results: [result, resultRenderer(v2, () => null)] }]);
    expect(registry.result(reference(data), { text: "old" })).not.toBeNull();
    expect(registry.result(reference(v2), { content: "new" })).not.toBeNull();
  });
  it("资源识别不调用正文解析，缺少卡片或资源实例时仍可取得描述", () => {
    const resolve = vi.fn(() => null);
    const descriptor = { kind: "text", label: "Text", icon: null };
    const registry = new ViewRegistry([{ resources: [descriptor], cards: [{ contract: reference(data), resolve }], results: [] }]);
    expect(registry.resource("text")).toBe(descriptor);
    expect(resolve).not.toHaveBeenCalled();
    expect(registry.resource("missing").kind).toBe("missing");
    expect(registry.resource("missing").label).toBeTruthy();
    expect(() => new ViewRegistry([{ resources: [descriptor, descriptor], cards: [], results: [] }])).toThrow("Duplicate resource description");
  });
});
