import { createElement, isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, present, reference } from "@atelier/sdk/contracts";
import type { Json } from "@atelier/sdk/contracts";
import { cardRenderer, toolRenderer, type ToolRenderProps } from "@atelier/sdk/renderer";
import { ViewRegistry } from "./registry";

const data = defineData("test.text", z.strictObject({ text: z.string() }));
function Text({ data }: { data: { text: string } }) { return createElement("p", null, data.text); }
function Header({ result }: ToolRenderProps<{ text: string }>) { return createElement("span", null, result?.data?.text); }
function Body({ result }: ToolRenderProps<{ text: string }>) { return createElement("p", null, result?.data?.text); }
const tool = toolRenderer(data, { bodyRenderer: Body });
const card = cardRenderer(data, { width: 340, height: 200, Body: Text });
const props = (value: Json): ToolRenderProps => ({ phase: "settled", name: "sample", target: null, args: {}, invocation: {}, result: { kind: "succeeded", data: value } });

describe("视图契约分派", () => {
  it("按身份选择组件，数据通过 schema 才进入组件", () => {
    const registry = new ViewRegistry([{ resources: [], cards: [card], tools: [tool] }]);
    const node = registry.tool(reference(data), props({ text: "saved" }))?.body;
    expect(isValidElement(node) && node.type).toBe(Body);
    expect(registry.card(present(data, { text: "saved" }))?.width).toBe(340);
    expect(registry.tool({ id: "unknown" }, props({ text: "saved" }))).toBeNull();
    expect(registry.tool(undefined, props({ text: "saved" }))).toBeNull();
    expect(registry.tool(reference(data), props({ text: 7 }))).toBeNull();
    expect(registry.card({ contract: reference(data), data: { text: 7 } })).toBeNull();
    expect(new ViewRegistry([]).card(present(data, { text: "saved" }))).toBeNull();
  });
  it("header 与 body 独立覆盖，收到同一份过程或终结结果，尚无产出时也能渲染摘要", () => {
    for (const definition of [{ headerRenderer: Header }, { bodyRenderer: Body }, { headerRenderer: Header, bodyRenderer: Body }, {}]) {
      const renderer = toolRenderer(data, definition);
      for (const input of [
        { ...props(null), phase: "ready" as const, result: null },
        { ...props({ text: "live" }), phase: "executing" as const, result: { kind: "running" as const, data: { text: "live" } } },
        { ...props({ text: "saved" }), result: { kind: "cancelled" as const, data: { text: "saved" }, message: "Stopped." } },
      ]) {
        const view = renderer.resolve(input)!;
        const header = view.header, body = view.body;
        expect(isValidElement(header)).toBe("headerRenderer" in definition);
        expect(isValidElement(body)).toBe("bodyRenderer" in definition);
        if (isValidElement<ToolRenderProps>(header)) expect(header.props.result).toEqual(input.result);
        if (isValidElement<ToolRenderProps>(body)) expect(body.props.result).toEqual(input.result);
        if (isValidElement<ToolRenderProps>(header) && isValidElement<ToolRenderProps>(body)) expect(header.props.result).toBe(body.props.result);
      }
    }
  });
  it("拒绝重复注册；当前 schema 可自行兼容旧数据形状", () => {
    expect(() => new ViewRegistry([{ resources: [], cards: [card, card], tools: [] }])).toThrow("Duplicate renderer");
    expect(() => new ViewRegistry([{ resources: [], cards: [], tools: [tool, tool] }])).toThrow("Duplicate renderer");
    const current = defineData(data.id, z.union([z.strictObject({ content: z.string() }),
      data.schema.transform(({ text }) => ({ content: text }))]));
    const registry = new ViewRegistry([{ resources: [], cards: [], tools: [toolRenderer(current, { bodyRenderer: () => null })] }]);
    expect(registry.tool(reference(data), props({ text: "old" }))).not.toBeNull();
    expect(registry.tool(reference(current), props({ content: "new" }))).not.toBeNull();
  });
  it("资源识别不调用正文解析，缺少卡片或资源实例时仍可取得描述", () => {
    const resolve = vi.fn(() => null);
    const descriptor = { kind: "text", label: "Text", icon: null };
    const registry = new ViewRegistry([{ resources: [descriptor], cards: [{ contract: reference(data), resolve }], tools: [] }]);
    expect(registry.resource("text")).toBe(descriptor);
    expect(resolve).not.toHaveBeenCalled();
    expect(registry.resource("missing").kind).toBe("missing");
    expect(registry.resource("missing").label).toBeTruthy();
    expect(() => new ViewRegistry([{ resources: [descriptor, descriptor], cards: [], tools: [] }])).toThrow("Duplicate resource description");
  });
});
