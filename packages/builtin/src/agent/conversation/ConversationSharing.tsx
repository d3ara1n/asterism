import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRendererObject } from "@asterism-app/sdk/renderer";
import type { TimelineItem } from "./timeline";
import type { ConversationHistoryWindow } from "./history-window";
import { ConversationShareContext } from "./share-context";
import { shareMessages } from "./share-content";
import type { ShareDialogProps } from "./ShareDialog";

const ShareDialog = lazy(() => import("./ShareDialog"));

/**
 * Capture the selected history path once. New agent output cannot change an open share preview.
 * The context value keeps one identity for the card's lifetime, so streaming updates do not rerender every message footer.
 */
export function ConversationSharing({ items, historyWindow, earlier, children }: {
  items: readonly TimelineItem[]; historyWindow: ConversationHistoryWindow; earlier: boolean; children: ReactNode;
}) {
  const object = useRendererObject();
  const [request, setRequest] = useState<ShareDialogProps | null>(null);
  const current = useRef({ object, items, historyWindow, earlier });
  useLayoutEffect(() => { current.current = { object, items, historyWindow, earlier }; });
  const open = useCallback((anchor: string, origin: HTMLElement) => {
    const { object, items, historyWindow, earlier } = current.current;
    const snapshot = object.session.snapshot();
    if (!snapshot) return;
    setRequest({ snapshot, messages: shareMessages(items), anchor,
      historyWindow: historyWindow.fork(), earlier, origin, onClose: () => setRequest(null) });
  }, []);
  return <ConversationShareContext value={open}>
    {children}
    {request && <Suspense fallback={null}><ShareDialog {...request} /></Suspense>}
  </ConversationShareContext>;
}
