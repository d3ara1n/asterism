import type { TimelineItem } from "./timeline";

export type BlockLine = "forming" | "incomplete" | "generation-error";

/** Only tool calls get a forming outline; saved outlines describe how generation ended, not context membership. */
export function blockLine(node: TimelineItem): BlockLine | undefined {
  if (node.kind === "toolcall" && "state" in node && node.state !== "executing") return "forming";
  if ("complete" in node && !node.complete) return node.generationFailed ? "generation-error" : "incomplete";
}
