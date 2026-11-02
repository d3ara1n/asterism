import type { TimelineItem } from "./timeline";
import type { ToolInvocationInfo } from "@asterism-app/sdk/contracts";
import type { ToolRenderProps } from "@asterism-app/sdk/renderer";

export type ToolCallNode = Extract<TimelineItem, { kind: "toolcall" }>;
export interface ToolCallState {
  phase: "input" | "ready" | "executing" | "settled" | "incomplete";
  props: ToolRenderProps | null;
}
/** History without an outcome reuses the input renderer with captured identity, independently of active execution. */
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
  if (!node.outcome) return { phase: "incomplete", props: {
    phase: "input", name: node.name, args: node.arguments, target: null, invocation: node.invocation ?? {}, result: null,
    ...(node.argumentsText !== null ? { argumentsText: node.argumentsText } : {}),
  } };
  const { implementation, resource, startedAt, finishedAt } = node.outcome;
  const invocation: ToolInvocationInfo = { implementation, resource, startedAt, finishedAt };
  return { phase: "settled",
    props: { phase: "settled", name: node.name, args: node.arguments, target: null, invocation, result: node.outcome } };
}
