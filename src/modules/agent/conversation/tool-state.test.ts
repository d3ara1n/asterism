import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { reference, type ModelLiveBlock } from "@atelier/sdk/contracts";
import type { TimelineItem } from "./timeline";

import { DirectoryList, DirectoryWrite } from "../../filesystem/contract";
import filesystem from "../../filesystem/renderer";
import { ViewRegistry } from "../../../renderer/modules/registry";
import type { ToolRenderProps, ToolInputRenderProps } from "@atelier/sdk/renderer";
import { advanceToolDisclosure, initialToolDisclosure, toolCallState } from "./tool-state";
import { resolveToolView, toolPreparation } from "../../../renderer/features/conversation/tool-views";

const args = { resource_id: "directory", tool: "list", target: { path: "src" }, args: {} };
const invocation = { implementation: reference(DirectoryList), resource: { id: "directory", kind: "atelier.core/directory", title: "Saved title" }, startedAt: 100 };
const live: Extract<ModelLiveBlock, { kind: "toolcall" }> = {
  id: "r:0", responseId: "r", ordinal: 0, kind: "toolcall", name: "resource_call", argumentsText: "", arguments: null,
  state: "input", invocation: null, result: null,
};
const data = { path: "src", entries: [{ name: "main.ts", type: "file" as const }], truncated: false };

describe("工具调用的展示投影", () => {
  it.each(["__proto__", "toString"])("未知一级入口 %s 在填充与终结阶段都使用默认视图", name => {
    const props: ToolRenderProps = { phase: "settled", name, args: {}, target: null, invocation: {},
      result: { kind: "rejected", data: null, error: { code: "operation_unavailable", message: "Unavailable." } } };
    const view = resolveToolView(props, new ViewRegistry([]));
    expect(view.props).toBe(props);
    expect(view.header).toBeUndefined();
    expect(view.body).toBeUndefined();
    expect(toolPreparation(name)).toBe("Preparing resource operation…");
  });

  it("填充交给可选视图，等待与执行通过阶段和产出区分", () => {
    expect(toolCallState({ ...live, argumentsText: '{"tool":"list",', arguments: { tool: "list" } })).toMatchObject({
      phase: "input", props: { phase: "input", args: { tool: "list" }, result: null },
    });
    expect(toolCallState({ ...live, state: "ready", arguments: args, invocation })).toMatchObject({ phase: "ready", props: { result: null } });
    expect(toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } })).toMatchObject({
      phase: "executing", props: { result: { kind: "running", data }, invocation },
    });
  });

  it("resource_call 自己将参数和结果交给内部工具，外壳只收到一份视图", () => {
    const registry = new ViewRegistry([filesystem]);
    const state = toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } });
    const view = resolveToolView(state.props!, registry);
    expect(view.props).toMatchObject({ name: "list", target: { path: "src" }, args: {}, result: { kind: "running", data } });
    expect(isValidElement<ToolRenderProps>(view.header) && view.header.props.invocation.resource?.title).toBe("Saved title");
    expect(isValidElement<ToolRenderProps>(view.body) && view.body.props.result).toEqual({ kind: "running", data });
    const missing = resolveToolView({ ...state.props!, invocation: { ...invocation, implementation: { id: "missing" } } }, registry);
    expect(missing.props.name).toBe("list");
    expect(missing.header).toBeUndefined();
    expect(missing.body).toBeUndefined();
    // 一级固定入口不依赖模块工具目录。
    expect(resolveToolView({ ...state.props!, phase: "settled", name: "resource_list", args: {}, invocation: {}, result: { kind: "succeeded", data: { resources: [] } } }, new ViewRegistry([])).body).toBeDefined();
  });

  it("取消后的历史仍交给内部工具两个 renderer，资源身份取自保存结果", () => {
    const node: Extract<TimelineItem, { kind: "toolcall" }> = {
      id: "saved", createdAt: "2026-10-01", usage: null, kind: "toolcall",
      responseId: "r", requestParentId: null, ordinal: 0, complete: true, source: { model: "p/m", adapter: "test", scope: "test" }, continuation: null,
      callId: "c", name: "resource_call", argumentsText: "", arguments: args,
      outcome: { ...invocation, finishedAt: 300, kind: "cancelled", data, model: "Stopped", message: "Stopped." },
    };
    const state = toolCallState(node);
    expect(state).toMatchObject({ phase: "settled", props: { invocation, result: { kind: "cancelled", data } } });
    const view = resolveToolView(state.props!, new ViewRegistry([filesystem]));
    expect(isValidElement<ToolRenderProps>(view.body) && view.body.props.result?.kind).toBe("cancelled");
    expect(isValidElement<ToolRenderProps>(view.header) && view.header.props.invocation.resource?.title).toBe("Saved title");
    expect(toolCallState({ ...node, complete: false, outcome: null })).toEqual({ phase: "incomplete", props: null });
  });

  it("write 的部分路径与正文进入专用填充视图，三个阶段沿用同一个 header", () => {
    const registry = new ViewRegistry([filesystem]);
    const props: ToolInputRenderProps = { phase: "input", name: "resource_call", target: null, result: null,
      invocation: { ...invocation, implementation: reference(DirectoryWrite) },
      args: { resource_id: "directory", tool: "write", target: { path: "src/comp" }, args: { content: "hello\nwor" } } };
    const view = resolveToolView(props, registry);
    expect(isValidElement<ToolInputRenderProps>(view.header) && view.header.props.target).toEqual({ path: "src/comp" });
    expect(isValidElement<ToolInputRenderProps>(view.body) && view.body.props.args).toEqual({ content: "hello\nwor" });
    const headerType = isValidElement(view.header) && view.header.type;
    for (const phase of ["ready", "executing", "settled"] as const) {
      const next = resolveToolView(phase === "settled"
        ? { ...props, phase, result: { kind: "succeeded", data: null } }
        : { ...props, phase }, registry);
      expect(isValidElement(next.header) && next.header.type).toBe(headerType);
      expect(next.props.args).toEqual({ content: "hello\nwor" });
    }
    expect(resolveToolView({ ...props, invocation: {} }, registry).body).toBeUndefined();
  });

  it("填充结束只折叠一次，增量与设置更新不覆盖手动选择", () => {
    const preferences = { toolInputAutoExpand: true, toolInputAutoCollapse: true };
    const initial = initialToolDisclosure(true, preferences, true);
    expect(initial.open).toBe(true);
    const closed = { ...initial, open: false };
    expect(advanceToolDisclosure(closed, true, preferences, true)).toBe(closed);
    expect(advanceToolDisclosure(initial, false, preferences, false)).toMatchObject({ filling: false, open: false });
    const reopened = { ...initial, filling: false, open: true };
    expect(advanceToolDisclosure(reopened, false, preferences, false)).toBe(reopened);
    expect(advanceToolDisclosure(initial, false, { ...preferences, toolInputAutoCollapse: false }, false).open).toBe(true);
    expect(initialToolDisclosure(true, { ...preferences, toolInputAutoExpand: false }, true).open).toBe(false);
    expect(initialToolDisclosure(false, preferences, false).open).toBe(false);
    const unidentified = initialToolDisclosure(true, preferences, false);
    expect(unidentified.open).toBe(false);
    expect(advanceToolDisclosure(unidentified, true, preferences, true).open).toBe(true);
    expect(advanceToolDisclosure(unidentified, false, { ...preferences, toolInputAutoCollapse: false }, false).open).toBe(false);
  });
});
