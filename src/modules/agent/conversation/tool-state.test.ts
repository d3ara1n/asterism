import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { reference, type ModelLiveBlock } from "@atelier/sdk/contracts";
import type { TimelineItem } from "./timeline";

import { DirectoryList } from "../../filesystem/contract";
import filesystem from "../../filesystem/renderer";
import { ViewRegistry } from "../../../renderer/modules/registry";
import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { toolCallState } from "./tool-state";
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

  it("填充不解析参数也不可展开；等待不伪装执行；有运行产出后才可展开", () => {
    expect(toolCallState({ ...live, argumentsText: '{"tool":"list",' })).toEqual({ phase: "input", props: null, expandable: false });
    expect(toolCallState({ ...live, state: "ready", arguments: args, invocation })).toMatchObject({ phase: "ready", expandable: false, props: { result: null } });
    expect(toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data: null } }).expandable).toBe(false);
    expect(toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } })).toMatchObject({
      phase: "executing", expandable: true, props: { result: { kind: "running", data }, invocation },
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
    expect(resolveToolView({ ...state.props!, name: "resource_list", args: {}, invocation: {}, result: { kind: "succeeded", data: { resources: [] } } }, new ViewRegistry([])).body).toBeDefined();
  });

  it("取消后的历史仍交给内部工具两个 renderer，资源身份取自保存结果", () => {
    const node: Extract<TimelineItem, { kind: "toolcall" }> = {
      id: "saved", createdAt: "2026-10-01", usage: null, kind: "toolcall",
      responseId: "r", requestParentId: null, ordinal: 0, complete: true, source: { model: "p/m", adapter: "test", scope: "test" }, continuation: null,
      callId: "c", name: "resource_call", argumentsText: "", arguments: args,
      outcome: { ...invocation, finishedAt: 300, kind: "cancelled", data, model: "Stopped", message: "Stopped." },
    };
    const state = toolCallState(node);
    expect(state).toMatchObject({ phase: "settled", expandable: true, props: { invocation, result: { kind: "cancelled", data } } });
    const view = resolveToolView(state.props!, new ViewRegistry([filesystem]));
    expect(isValidElement<ToolRenderProps>(view.body) && view.body.props.result?.kind).toBe("cancelled");
    expect(isValidElement<ToolRenderProps>(view.header) && view.header.props.invocation.resource?.title).toBe("Saved title");
    expect(toolCallState({ ...node, complete: false, outcome: null })).toEqual({ phase: "incomplete", expandable: false, props: null });
  });
});
