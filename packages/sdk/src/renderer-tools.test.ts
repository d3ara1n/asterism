import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData } from "./presentation.ts";
import { toolRenderer, type ToolRenderProps } from "./renderer-tools.ts";

const contract = {
  ...defineData("example.preview", z.object({ text: z.string().trim() })),
  tool: { argsSchema: z.object({ content: z.string() }) },
};
const input: ToolRenderProps = { phase: "input", name: "preview", target: null, args: {}, invocation: {}, result: null };

describe("工具流式预览声明", () => {
  // 填充先于完整参数出现，声明必须接收部分 JSON；仅有正文组件不能替代插件的明确声明。
  it("部分输入由插件判断是否可预览，未声明的正文保持普通视图", () => {
    const bodyRenderer = vi.fn(() => null);
    const renderer = toolRenderer(contract, { input: { bodyRenderer, streaming: ({ args }) =>
      args !== null && typeof args === "object" && !Array.isArray(args) && typeof args.content === "string" && args.content.length > 0 } });
    expect(renderer.resolve(input)?.streaming).toBe(false);
    expect(renderer.resolve({ ...input, args: { content: "partial" } })?.streaming).toBe(true);
    expect(toolRenderer(contract, { input: { bodyRenderer } }).resolve({ ...input, args: { content: "partial" } })?.streaming).toBe(false);
    expect(bodyRenderer).not.toHaveBeenCalled();
  });

  // 声明必须使用与正文相同的已解码数据，否则会因原始载荷的空白或错误类型提前展开、抛错。
  it("执行声明消费解码后的结果，非法载荷不进入声明", () => {
    const streaming = vi.fn(({ result }: { result: { data: { text: string } | null } | null }) => !!result?.data?.text);
    const renderer = toolRenderer(contract, { execution: { bodyRenderer: () => null, streaming } });
    const executing: ToolRenderProps = { ...input, phase: "executing", args: { content: "" },
      result: { kind: "running", data: { text: "   " } } };
    expect(renderer.resolve(executing)?.streaming).toBe(false);
    expect(renderer.resolve({ ...executing, result: { kind: "running", data: { text: " report " } } })?.streaming).toBe(true);
    expect(streaming.mock.lastCall?.[0].result?.data?.text).toBe("report");
    streaming.mockClear();
    expect(renderer.resolve({ ...executing, result: { kind: "running", data: { text: 7 } } })).toBeNull();
    expect(streaming).not.toHaveBeenCalled();
  });

  // 等待与执行共享入口、多个阶段可复用对象；阶段分派必须拦住等待、终结及没有正文的声明。
  it("等待、终结与无正文视图不触发流式与需要处理判断", () => {
    const streaming = vi.fn(() => true);
    const attention = vi.fn(() => true);
    const shared = { bodyRenderer: () => null, streaming, attention };
    const renderer = toolRenderer(contract, { execution: shared, result: shared });
    expect(renderer.resolve({ ...input, phase: "ready", args: { content: "" } })).toMatchObject({ streaming: false, attention: false });
    expect(renderer.resolve({ ...input, phase: "settled", args: { content: "" },
      result: { kind: "succeeded", data: { text: "saved" } } })).toMatchObject({ streaming: false, attention: false });
    expect(toolRenderer(contract, { input: { streaming } }).resolve(input)?.streaming).toBe(false);
    expect(toolRenderer(contract, { execution: { attention } }).resolve({ ...input, phase: "executing", args: { content: "" } })?.attention).toBe(false);
    expect(streaming).not.toHaveBeenCalled();
    expect(attention).not.toHaveBeenCalled();
    expect(renderer.resolve({ ...input, phase: "executing", args: { content: "" } })?.attention).toBe(true);
  });
});
