import { useI18n } from "@asterism-app/sdk/renderer";
import { conversationMessages } from "../../messages/conversation";
import { ExecutionErrorDetails } from "../ErrorDetails";
import { IncidentBlock, OccurrenceRow } from "./Notice";
import type { TimelineItem } from "./timeline";

const labels = {
  completed: conversationMessages.contextSummary,
  failed: conversationMessages.compressionFailed,
  cancelled: conversationMessages.compressionCancelled,
};

/** An occurrence on the recorded timeline, distinct from the summary at the retained-content boundary. */
export function CompressionMarker({ node }: { node: Extract<TimelineItem, { kind: "compression" }> }) {
  const i18n = useI18n();
  const details = node.details ? <ExecutionErrorDetails code="context_compression_failed" details={node.details} /> : undefined;
  const label = i18n.text(labels[node.status]);
  // A failed compaction is the one incident here; a completed or stopped one merely happened.
  return node.status === "failed"
    ? <IncidentBlock message={label} details={details} />
    : <OccurrenceRow details={details}>{label}</OccurrenceRow>;
}
