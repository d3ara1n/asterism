import { useI18n } from "@asterism-app/sdk/renderer";
import { Marker, MarkerContent, MarkerIcon } from "@asterism-app/ui/ui/marker";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { conversationMessages } from "../../messages/conversation";
import { ExecutionErrorDetails } from "../ErrorDetails";
import type { TimelineItem } from "./timeline";
import { conversationTransition, immediateTransition } from "./motion";

const labels = {
  running: conversationMessages.compressing,
  completed: conversationMessages.contextSummary,
  boundary: conversationMessages.compressedHistory,
  failed: conversationMessages.compressionFailed,
  cancelled: conversationMessages.compressionCancelled,
};
const tones: Partial<Record<keyof typeof labels, StatusTone>> = { running: "progress", failed: "warning" };

/** Compression shows only activity status and the reading boundary; the summary body stays in the original record and failure causes stay behind details. */
export function CompressionMarker({ node }: { node: Extract<TimelineItem, { kind: "compression" }> }) {
  const i18n = useI18n();
  const running = node.status === "running";
  const tone = tones[node.status];
  const reducedMotion = useReducedMotion();
  return <Marker variant="separator" role={running ? "status" : undefined} className="min-h-8 text-xs">
    <MarkerContent className="relative">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={node.status} className="inline-flex items-center gap-2 align-middle"
          initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }} exit={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : -4 }}
          transition={reducedMotion ? immediateTransition : conversationTransition}>
          {tone && <MarkerIcon><StatusIcon tone={tone} className="size-4" /></MarkerIcon>}
          <span>{i18n.formatMessage(labels[node.status])}</span>
          {node.details && <ExecutionErrorDetails code="context_compression_failed" details={node.details} />}
        </motion.span>
      </AnimatePresence>
    </MarkerContent>
  </Marker>;
}
