import type { TimelineItem } from "./timeline";
import type { ToolInvocationInfo } from "@atelier/sdk/contracts";
import type { ToolRenderProps } from "@atelier/sdk/renderer";

export type ToolCallNode = Extract<TimelineItem, { kind: "toolcall" }>;
export interface ToolCallState {
  phase: "input" | "ready" | "executing" | "settled" | "incomplete";
  props: ToolRenderProps | null;
}
/** 填充只消费即时预览；历史完全使用当次保存的身份和结果。 */
export function toolCallState(node: ToolCallNode): ToolCallState {
  if ("state" in node) {
    if (node.state === "input") return { phase: "input",
      props: { phase: "input", name: node.name, args: node.arguments, target: null, invocation: node.invocation ?? {}, result: null } };
    return {
      phase: node.state,
      props: { phase: node.state, name: node.name, args: node.arguments, target: null,
        invocation: node.invocation ?? {}, result: node.result },
    };
  }
  if (!node.outcome) return { phase: "incomplete", props: null };
  const { implementation, resource, startedAt, finishedAt } = node.outcome;
  const invocation: ToolInvocationInfo = { implementation, resource, startedAt, finishedAt };
  return { phase: "settled",
    props: { phase: "settled", name: node.name, args: node.arguments, target: null, invocation, result: node.outcome } };
}

type ToolDisclosurePreferences = { toolInputAutoExpand: boolean; toolInputAutoCollapse: boolean };
export interface ToolDisclosure { filling: boolean; open: boolean; previewSeen: boolean }
export function initialToolDisclosure(filling: boolean, preferences: ToolDisclosurePreferences, hasInputBody: boolean): ToolDisclosure {
  return { filling, open: filling && hasInputBody && preferences.toolInputAutoExpand, previewSeen: filling && hasInputBody };
}
/** 只在离开填充态时自动折叠一次；后续执行、结束与增量均保留手动选择。 */
export function advanceToolDisclosure(state: ToolDisclosure, filling: boolean, preferences: ToolDisclosurePreferences, hasInputBody: boolean): ToolDisclosure {
  if (state.filling !== filling) return filling ? initialToolDisclosure(true, preferences, hasInputBody)
    : { ...state, filling, open: preferences.toolInputAutoCollapse ? false : state.open };
  // 身份可能晚于块起点才明确；只在第一个可展开预览出现时应用自动展开。
  if (filling && hasInputBody && !state.previewSeen) return { ...state, previewSeen: true, open: preferences.toolInputAutoExpand };
  return state;
}
