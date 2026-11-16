import { lazy, Suspense, useState, type ReactNode } from "react";
import { useRendererObject } from "@asterism-app/sdk/renderer";
import type { TimelineItem } from "./timeline";
import type { ConversationHistoryWindow } from "./history-window";
import { ConversationShareContext } from "./share-context";
import { shareMessages } from "./share-content";
import type { ShareDialogProps } from "./ShareDialog";

const ShareDialog = lazy(() => import("./ShareDialog"));

/** Capture the selected history path once. New agent output cannot change an open share preview. */
export function ConversationSharing({ items, historyWindow, earlier, children }: {
  items: readonly TimelineItem[]; historyWindow: ConversationHistoryWindow; earlier: boolean; children: ReactNode;
}) {
  const object = useRendererObject();
  const [request, setRequest] = useState<ShareDialogProps | null>(null);
  return <ConversationShareContext value={(anchor, origin) => {
    const snapshot = object.session.snapshot();
    if (!snapshot) return;
    setRequest({ snapshot, agentId: object.ref.id, messages: shareMessages(items), anchor,
      historyWindow: historyWindow.fork(), earlier, origin, onClose: () => setRequest(null) });
  }}>
    {children}
    {request && <Suspense fallback={null}><ShareDialog {...request} /></Suspense>}
  </ConversationShareContext>;
}
