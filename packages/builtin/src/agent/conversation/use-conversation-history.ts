import { useCallback, useMemo, useState } from "react";
import { useSessionRead, type RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import type { ModelLiveBlock } from "@asterism-app/sdk/contracts";
import type { CompressionActivity, InlineFeedback } from "../feedback";
import { readConversation } from "./read-history";
import type { ConversationHistoryWindow } from "./history-window";
import { displayedTimeline, liveTimeline, conversationTimeline, withLive } from "./timeline";

/** Owns the reading window and the handoff from live output to saved records. */
export function useConversationHistory(snapshot: RendererSessionSnapshot | null, agentId: string, window: ConversationHistoryWindow,
  blocks: readonly ModelLiveBlock[], running: boolean, feedback: readonly InlineFeedback[], compressions: readonly CompressionActivity[]) {
  const read = useSessionRead(snapshot,
    useCallback((snapshot, signal) => readConversation(snapshot, agentId, window, signal), [agentId, window]),
    { keepPrevious: true });
  const saved = useMemo(() => read.data ? conversationTimeline(read.data.projection, running, feedback, compressions) : null,
  [read.data, running, feedback, compressions]);
  const retaining = read.status === "loading" && read.data !== null;
  const [observed, setObserved] = useState(() => liveTimeline(null, blocks, retaining));
  const output = liveTimeline(observed, blocks, retaining);
  // Adjust only when an observed input changes; React restarts this component with the new immutable state.
  if (output !== observed) setObserved(output);
  const items = useMemo(() => saved ? displayedTimeline(withLive(saved, output.visible)) : [], [saved, output.visible]);
  const loadEarlier = () => {
    if (!read.data?.earlier) return;
    window.expand(read.data.index);
    read.retry();
  };
  return { read, items, loadEarlier };
}
