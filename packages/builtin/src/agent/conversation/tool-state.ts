import type { TimelineItem } from "./timeline";
import type { ToolInvocationInfo } from "@asterism-app/sdk/contracts";
import type { AnyToolRenderProps } from "@asterism-app/sdk/renderer";

export type ToolCallNode = Extract<TimelineItem, { kind: "toolcall" }>;
export interface ToolCallState {
  phase: "input" | "ready" | "executing" | "settled" | "incomplete";
  props: AnyToolRenderProps;
}
/** History without an outcome reuses the input renderer with captured identity, independently of active execution. */
export function toolCallState(node: ToolCallNode): ToolCallState {
  const { name, input, draft } = node;
  const invocation = node.invocation ?? {};
  const freeform = input?.kind === "freeform" || draft?.kind === "freeform";
  const call = freeform ? { name, kind: "freeform" as const,
    text: draft?.kind === "freeform" ? draft.text : input?.kind === "freeform" ? input.text : null }
    : { name, target: null, args: input?.kind === "structured" ? input.value : null };
  if ("state" in node && node.state !== "input") return { phase: node.state,
    props: { ...call, phase: node.state, invocation, result: node.result } };
  if ("state" in node || !node.outcome) return { phase: "state" in node ? "input" : "incomplete",
    props: call.kind === "freeform" ? { ...call, phase: "input", invocation, result: null }
      : { ...call, phase: "input", draft, invocation, result: null } };
  const { implementation, resource, startedAt, finishedAt } = node.outcome;
  const recorded: ToolInvocationInfo = { implementation, resource, startedAt, finishedAt };
  return { phase: "settled", props: { ...call, phase: "settled", invocation: recorded, result: node.outcome } };
}
