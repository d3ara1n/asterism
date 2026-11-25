import { generating, type TimelineItem } from "./timeline";

export type BlockLine = "forming" | "incomplete" | "generation-error";

/** The outline describes completion, not whether the record participates in context. */
export function blockLine(node: TimelineItem): BlockLine | undefined {
  if (generating(node) || (node.kind === "toolcall" && "state" in node && node.state !== "executing")) return "forming";
  if ("complete" in node && !node.complete) return node.generationFailed ? "generation-error" : "incomplete";
}
