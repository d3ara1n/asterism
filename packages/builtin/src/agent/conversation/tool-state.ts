import type { TimelineItem } from "./timeline";
import type { ToolInvocationInfo } from "@asterism-app/sdk/contracts";
import type { ToolRenderProps } from "@asterism-app/sdk/renderer";

export type ToolCallNode = Extract<TimelineItem, { kind: "toolcall" }>;
export interface ToolCallState {
  phase: "input" | "ready" | "executing" | "settled" | "incomplete";
  props: ToolRenderProps | null;
}
/** Input filling consumes only live previews; history uses only the identity and results saved for that call. */
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
