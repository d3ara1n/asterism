import { useState } from "react";
import type { StreamingScrollAreaProps } from "@asterism-app/sdk/renderer";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent,
  MessageScrollerProvider, MessageScrollerViewport } from "./ui/message-scroller";
import { cn } from "./utils";

/** A bounded, selectable reading region that follows new content at the end. Keep fixed context outside it. */
export function StreamingScrollArea({ children, label, className, initialScrollPosition = "end" }: StreamingScrollAreaProps) {
  // A tool can settle in place without resetting the reader's viewport to the history default.
  const [position] = useState(initialScrollPosition);
  return <MessageScrollerProvider autoScroll defaultScrollPosition={position}>
    <MessageScroller className={cn("h-40", className)}>
      <MessageScrollerViewport aria-label={label} preserveScrollOnPrepend={false}
        className="overscroll-auto data-scrollable:overscroll-y-contain focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <MessageScrollerContent role="group" className="gap-0 wrap-anywhere p-1 pr-3">{children}</MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton className="data-[direction=end]:bottom-2" behavior="auto" />
    </MessageScroller>
  </MessageScrollerProvider>;
}
