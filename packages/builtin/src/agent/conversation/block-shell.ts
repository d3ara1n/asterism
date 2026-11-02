import type { TimelineItem } from "./timeline";

/** Shells describe participation and request failures without changing the original content renderer.
 * Saved blocks read outside the conversation timeline carry no presentation flags, so incompleteness still marks them. */
export function blockShell(node: TimelineItem) {
  return {
    dashed: ("partialContext" in node && node.partialContext === true) || ("complete" in node && !node.complete),
    failed: "failed" in node && node.failed === true,
  };
}
