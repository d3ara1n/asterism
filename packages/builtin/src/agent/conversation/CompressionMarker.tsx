import { useI18n } from "@asterism/sdk/renderer";
import { Marker, MarkerContent, MarkerIcon } from "@asterism/ui/ui/marker";
import { StatusIcon } from "@asterism/ui/ui/status";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { conversationMessages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";
import { conversationTransition, immediateTransition } from "./motion";

const labels = {
  running: conversationMessages.compressing,
  completed: conversationMessages.contextSummary,
  boundary: conversationMessages.compressedHistory,
  failed: conversationMessages.compressionFailed,
  cancelled: conversationMessages.compressionCancelled,
};

/** 压缩只显示活动状态与阅读边界；摘要正文留在原始记录中。 */
export function CompressionMarker({ node }: { node: Extract<TimelineItem, { kind: "compression" }> }) {
  const i18n = useI18n();
  const running = node.status === "running";
  const reducedMotion = useReducedMotion();
  return <Marker variant="separator" role={running ? "status" : undefined} className="min-h-8 text-xs">
    <MarkerContent className="relative">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={node.status} className="inline-flex items-center gap-2 align-middle"
          initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }} exit={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : -4 }}
          transition={reducedMotion ? immediateTransition : conversationTransition}>
          {running && <MarkerIcon><StatusIcon tone="progress" className="size-4" /></MarkerIcon>}
          <span>{i18n.formatMessage(labels[node.status])}</span>
        </motion.span>
      </AnimatePresence>
    </MarkerContent>
  </Marker>;
}
