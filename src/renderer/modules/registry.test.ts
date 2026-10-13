import { createElement, isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, present, reference } from "@atelier/sdk/contracts";
import type { Json } from "@atelier/sdk/contracts";
import { cardRenderer, toolRenderer, type ToolRenderProps, type ToolInputRenderProps, type ToolResultRenderProps } from "@atelier/sdk/renderer";
import { ViewRegistry } from "./registry";

const data = defineData("test.text", z.strictObject({ text: z.string() }));
function Text({ data }: { data: { text: string } }) { return createElement("p", null, data.text); }
function Header({ result }: ToolRenderProps<{ text: string }>) { return createElement("span", null, result?.data?.text); }
function Body({ result }: ToolRenderProps<{ text: string }>) { return createElement("p", null, result?.data?.text); }
const tool = toolRenderer(data, { result: { bodyRenderer: Body } });
const card = cardRenderer(data, { width: 340, height: 200, Body: Text });
const props = (value: Json): ToolResultRenderProps => ({ phase: "settled", name: "sample", target: null, args: {}, invocation: {}, result: { kind: "succeeded", data: value } });

describe("视图契约分派", () => {
  it("填充视图独立可选，不把未完成参数交给完整参数的 renderer", () => {
    const Header = vi.fn(() => null);
    const Preview = (_props: ToolInputRenderProps) => null;
    const contract = { ...data, targetSchema: z.object({ path: z.string() }), tool: { argsSchema: z.object({ content: z.string() }) } };
    const input: ToolInputRenderProps = { phase: "input", name: "write", target: {}, args: null, invocation: {}, result: null };
    expect(toolRenderer(contract, { execution: { headerRenderer: Header } }).resolve(input)).toBeNull();
    const renderer = toolRenderer(contract, { execution: { headerRenderer: Header }, input: { bodyRenderer: Preview } });
    const view = renderer.resolve(input)!;
    expect(view.header).toBeUndefined();
    expect(isValidElement<ToolInputRenderProps>(view.body) && view.body.type).toBe(Preview);
    expect(isValidElement<ToolInputRenderProps>(view.body) && view.body.props.args).toBeNull();
    expect(renderer.resolve({ ...input, phase: "ready" })).toBeNull();
    expect(Header).not.toHaveBeenCalled();
  });
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
      const renderer = toolRenderer(data, { input: definition, execution: definition, result: definition });
      for (const input of [
        { ...props(null), phase: "input" as const, result: null },
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
    expect(() => new ViewRegistry([{ resources: [], cards: [card, card], tools: [] }])).toThrow();
    expect(() => new ViewRegistry([{ resources: [], cards: [], tools: [tool, tool] }])).toThrow();
    const current = defineData(data.id, z.union([z.strictObject({ content: z.string() }),
      data.schema.transform(({ text }) => ({ content: text }))]));
    const registry = new ViewRegistry([{ resources: [], cards: [], tools: [toolRenderer(current, { result: { bodyRenderer: () => null } })] }]);
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
    expect(() => new ViewRegistry([{ resources: [descriptor, descriptor], cards: [], tools: [] }])).toThrow();
  });

  it("三态按同级入口分派，等待使用执行视图，缺少阶段不会借用其他阶段", () => {
    const Input = () => null, Execution = () => null, Result = () => null;
    const renderer = toolRenderer(data, {
      input: { headerRenderer: Input }, execution: { headerRenderer: Execution }, result: { headerRenderer: Result },
    });
    const states: [ToolRenderProps, unknown][] = [
      [{ ...props(null), phase: "input", result: null }, Input],
      [{ ...props(null), phase: "ready", result: null }, Execution],
      [{ ...props(null), phase: "executing", result: { kind: "running", data: null } }, Execution],
      [props({ text: "done" }), Result],
    ];
    for (const [state, expected] of states) {
      const header = renderer.resolve(state)?.header;
      expect(isValidElement(header) && header.type).toBe(expected);
    }
    const resultOnly = toolRenderer(data, { result: { headerRenderer: Result } });
    expect(resultOnly.resolve(states[0]![0])).toBeNull();
    expect(resultOnly.resolve(states[1]![0])?.header).toBeUndefined();
  });
});
