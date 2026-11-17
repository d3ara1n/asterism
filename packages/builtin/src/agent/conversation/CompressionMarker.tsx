import { useI18n } from "@asterism-app/sdk/renderer";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { Info } from "lucide-react";
import { conversationMessages } from "../../messages/conversation";
import { ExecutionErrorDetails } from "../ErrorDetails";
import type { TimelineItem } from "./timeline";

const labels = {
  completed: conversationMessages.contextSummary,
  failed: conversationMessages.compressionFailed,
  cancelled: conversationMessages.compressionCancelled,
};

/** An occurrence on the recorded timeline, distinct from the summary at the retained-content boundary. */
export function CompressionMarker({ node }: { node: Extract<TimelineItem, { kind: "compression" }> }) {
  const i18n = useI18n();
  return <Marker className="min-h-8 text-xs">
    <MarkerIcon>{node.status === "failed" ? <StatusIcon tone="warning" /> : <Info />}</MarkerIcon>
    <MarkerContent>{i18n.text(labels[node.status])}</MarkerContent>
    {node.details && <ExecutionErrorDetails code="context_compression_failed" details={node.details} />}
  </Marker>;
}
