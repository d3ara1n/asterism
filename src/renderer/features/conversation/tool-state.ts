import type { TimelineItem } from "../../../shared/session-view";
import type { ToolInvocationInfo } from "../../../shared/tool-result";
import type { ToolRenderProps } from "../../modules/registry";

export type ToolCallNode = Extract<TimelineItem, { kind: "toolcall" }>;
export interface ToolCallState {
  phase: "input" | "ready" | "executing" | "settled" | "incomplete";
  props: ToolRenderProps | null;
  expandable: boolean;
}
/** 填充不猜测 JSON；历史完全使用当次保存的身份和结果。 */
export function toolCallState(node: ToolCallNode): ToolCallState {
  if ("state" in node) {
    if (node.state === "input") return { phase: "input", props: null, expandable: false };
    return {
      phase: node.state,
      props: { phase: node.state, name: node.name, args: node.arguments, target: null,
        invocation: node.invocation ?? {}, result: node.result },
      expandable: node.state === "executing" && node.result !== null && node.result.data !== null,
    };
  }
  if (!node.outcome) return { phase: "incomplete", props: null, expandable: false };
  const { implementation, resource, startedAt, finishedAt } = node.outcome;
  const invocation: ToolInvocationInfo = { implementation, resource, startedAt, finishedAt };
  return { phase: "settled", expandable: true,
    props: { phase: "settled", name: node.name, args: node.arguments, target: null, invocation, result: node.outcome } };
}
