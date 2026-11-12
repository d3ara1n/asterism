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

  it("Preserves partial input arguments and distinguishes waiting from execution through phase and output", () => {
    expect(toolCallState({ ...live, argumentsText: '{"tool":"list",', arguments: { tool: "list" } })).toMatchObject({
      phase: "input", props: { phase: "input", args: { tool: "list" }, result: null },
    });
    expect(toolCallState({ ...live, state: "ready", arguments: args, invocation })).toMatchObject({ phase: "ready", props: { result: null } });
    expect(toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } })).toMatchObject({
      phase: "executing", props: { result: { kind: "running", data }, invocation },
    });
  });

  it("resource_call normalizes the internal tool name, target, arguments and result", () => {
    const registry = new ViewRegistry([filesystem]);
    const state = toolCallState({ ...live, state: "executing", arguments: args, invocation, result: { kind: "running", data } });
    const view = resolveToolView(state.props!, registry);
    expect(view.props).toMatchObject({ name: "list", target: { path: "src" }, args: {}, result: { kind: "running", data } });
  });

  it("Preserves cancelled results, saved resource identity and incomplete history state", () => {
    const node: Extract<TimelineItem, { kind: "toolcall"; createdAt: string }> = {
      id: "saved", createdAt: "2026-10-01", kind: "toolcall",
      responseId: "r", ordinal: 0, complete: true,
      callId: "c", name: "resource_call", argumentsText: "", arguments: args,
      outcome: { ...invocation, finishedAt: 300, kind: "cancelled", data, model: [{ kind: "text", text: "Stopped" }], message: "Stopped." },
    };
    const state = toolCallState(node);
    expect(state).toMatchObject({ phase: "settled", props: { invocation, result: { kind: "cancelled", data } } });
    expect(toolCallState({ ...node, complete: false, outcome: null, argumentsText: null, invocation })).toMatchObject({
      phase: "incomplete", props: { phase: "input", args, invocation, result: null },
    });
  });

  it("Normalizes partial write targets and arguments across input and subsequent phases", () => {
    const registry = new ViewRegistry([filesystem]);
    const props: ToolInputRenderProps = { phase: "input", name: "resource_call", target: null, result: null,
      invocation: { ...invocation, implementation: reference(DirectoryWrite) },
      args: { resource_id: "directory", tool: "write", target: { path: "src/comp" }, args: { content: "hello\nwor" } } };
    const view = resolveToolView(props, registry);
    expect(view.props.target).toEqual({ path: "src/comp" });
    expect(view.props.args).toEqual({ content: "hello\nwor" });
    for (const phase of ["ready", "executing", "settled"] as const) {
      const next = resolveToolView(phase === "settled"
        ? { ...props, phase, result: { kind: "succeeded", data: null } }
        : { ...props, phase }, registry);
      expect(next.props.target).toEqual({ path: "src/comp" });
      expect(next.props.args).toEqual({ content: "hello\nwor" });
    }
    expect(resolveToolView({ ...props, invocation: {} }, registry).body).toBeUndefined();
  });

});
