import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { reference, type ModelLiveBlock } from "@asterism-app/sdk/contracts";
import type { TimelineItem } from "./timeline";

import { DirectoryList, DirectoryWrite } from "../../filesystem/contract";
import filesystem from "../../filesystem/renderer";
import { ViewRegistry } from "../../../../../src/renderer/modules/registry";
import type { ToolRenderProps, ToolInputRenderProps } from "@asterism-app/sdk/renderer";
import { toolCallState } from "./tool-state";
import { resolveToolView, toolPreparation } from "../../../../../src/renderer/features/conversation/tool-views";

const args = { resource_id: "directory", tool: "list", target: { path: "src" }, args: {} };
const invocation = { implementation: reference(DirectoryList), resource: { id: "directory", kind: "asterism.builtin/directory", title: "Saved title" }, startedAt: 100 };
const live: Extract<ModelLiveBlock, { kind: "toolcall" }> = {
  id: "r:0", responseId: "r", ordinal: 0, kind: "toolcall", name: "resource_call", argumentsText: "", arguments: null,
  state: "input", invocation: null, result: null,
};
const data = { path: "src", entries: [{ name: "main.ts", type: "file" as const }], truncated: false };

describe("Tool call display projection", () => {
  it.each(["__proto__", "toString"])("Unknown top-level entry %s uses the default view during both input filling and finalization", name => {
    const props: ToolRenderProps = { phase: "settled", name, args: {}, target: null, invocation: {},
      result: { kind: "rejected", data: null, error: { code: "operation_unavailable", message: "Unavailable." } } };
    const view = resolveToolView(props, new ViewRegistry([]));
    expect(view.props).toBe(props);
    expect(view.header).toBeUndefined();
    expect(view.body).toBeUndefined();
    expect(toolPreparation(name).length).toBeGreaterThan(0);
  });

  it("Delegates input filling to an optional view and distinguishes waiting from execution through phase and output", () => {
    expect(toolCallState({ ...live, argumentsText: '{"tool":"list",', arguments: { tool: "list" } })).toMatchObject({
      phase: "input", props: { phase: "input", args: { tool: "list" }, result: null },
    });
    expect(toolCallState({ ...live, state: "ready", arguments: args, invocation })).toMatchObject({ phase: "ready", props: { result: null } });
    expect(toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } })).toMatchObject({
      phase: "executing", props: { result: { kind: "running", data }, invocation },
    });
  });

  it("resource_call forwards arguments and results to the internal tool itself; the shell receives a single view", () => {
    const registry = new ViewRegistry([filesystem]);
    const state = toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } });
    const view = resolveToolView(state.props!, registry);
    expect(view.props).toMatchObject({ name: "list", target: { path: "src" }, args: {}, result: { kind: "running", data } });
    expect(isValidElement<ToolRenderProps>(view.header) && view.header.props.invocation.resource?.title).toBe("Saved title");
    expect(isValidElement<ToolRenderProps>(view.body) && view.body.props.result).toEqual({ kind: "running", data });
    // Fixed top-level entry points do not depend on the module tool catalog.
    expect(resolveToolView({ ...state.props!, phase: "settled", name: "resource_list", args: {}, invocation: {}, result: { kind: "succeeded", data: { resources: [] } } }, new ViewRegistry([])).body).toBeDefined();
  });

  it("Cancelled history still reaches both internal tool renderers, with resource identity taken from the saved result", () => {
    const node: Extract<TimelineItem, { kind: "toolcall" }> = {
      id: "saved", createdAt: "2026-10-01", kind: "toolcall",
      responseId: "r", requestParentId: null, ordinal: 0, complete: true, source: { model: "p/m", adapter: "test", scope: "test" }, continuation: null,
      callId: "c", name: "resource_call", argumentsText: "", arguments: args,
      outcome: { ...invocation, finishedAt: 300, kind: "cancelled", data, model: [{ kind: "text", text: "Stopped" }], message: "Stopped." },
    };
    const state = toolCallState(node);
    expect(state).toMatchObject({ phase: "settled", props: { invocation, result: { kind: "cancelled", data } } });
    const view = resolveToolView(state.props!, new ViewRegistry([filesystem]));
    expect(isValidElement<ToolRenderProps>(view.body) && view.body.props.result?.kind).toBe("cancelled");
    expect(isValidElement<ToolRenderProps>(view.header) && view.header.props.invocation.resource?.title).toBe("Saved title");
    expect(toolCallState({ ...node, complete: false, outcome: null })).toEqual({ phase: "incomplete", props: null });
  });

  it("Partial write arguments reach the input view, while subsequent phases retain that call's target and arguments", () => {
    const registry = new ViewRegistry([filesystem]);
    const props: ToolInputRenderProps = { phase: "input", name: "resource_call", target: null, result: null,
      invocation: { ...invocation, implementation: reference(DirectoryWrite) },
      args: { resource_id: "directory", tool: "write", target: { path: "src/comp" }, args: { content: "hello\nwor" } } };
    const view = resolveToolView(props, registry);
    expect(isValidElement<ToolInputRenderProps>(view.header) && view.header.props.target).toEqual({ path: "src/comp" });
    expect(isValidElement<ToolInputRenderProps>(view.body) && view.body.props.args).toEqual({ content: "hello\nwor" });
    for (const phase of ["ready", "executing", "settled"] as const) {
      const next = resolveToolView(phase === "settled"
        ? { ...props, phase, result: { kind: "succeeded", data: null } }
        : { ...props, phase }, registry);
      expect(isValidElement<ToolInputRenderProps>(next.header) && next.header.props.target).toEqual({ path: "src/comp" });
      expect(next.props.args).toEqual({ content: "hello\nwor" });
    }
    expect(resolveToolView({ ...props, invocation: {} }, registry).body).toBeUndefined();
  });

});
