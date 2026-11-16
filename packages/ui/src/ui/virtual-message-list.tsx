import { useRef, type ComponentProps, type ReactElement, type ReactNode, type Ref, type RefObject } from "react";
import { Virtualizer, type VirtualizerHandle, type VirtualizerProps } from "virtua";
import { MessageScrollerContent, MessageScrollerViewport } from "./message-scroller";
import { cn } from "../utils";

type VirtualMessageListProps<T> = Omit<VirtualizerProps<T>, "children" | "data" | "horizontal" | "scrollRef"> & {
  data: readonly T[];
  children(item: T, index: number): ReactElement;
  ref?: Ref<VirtualizerHandle>;
  viewportRef?: RefObject<HTMLDivElement | null>;
  viewportProps?: Omit<ComponentProps<typeof MessageScrollerViewport>, "children" | "ref" | "preserveScrollOnPrepend">;
  contentClassName?: string;
  empty?: ReactNode;
};

/** MessageScroller owns follow-output; virtua owns row mounting and measurement in the same viewport. */
export function VirtualMessageList<T>({ data, children, ref, viewportRef, viewportProps, contentClassName, empty,
  keepMounted = [], ...props }: VirtualMessageListProps<T>) {
  const localViewport = useRef<HTMLDivElement>(null);
  const viewport = viewportRef ?? localViewport;
  // The final row remains measurable while output grows, even when the reader is elsewhere.
  const mounted = data.length ? [...new Set([...keepMounted, data.length - 1])].sort((a, b) => a - b) : [];
  return <MessageScrollerViewport {...viewportProps} ref={viewport} preserveScrollOnPrepend={false}
    className={cn("[overflow-anchor:none]", viewportProps?.className)}>
    {/* Virtua owns prepend compensation; mounted rows expose actual layout instead of CSS placeholders. */}
    <MessageScrollerContent className={cn("gap-0 [&_[data-slot=message-scroller-item]]:[content-visibility:visible]", data.length > 0 && "block", contentClassName)}>
      {data.length > 0
        ? <Virtualizer {...props} ref={ref} data={data} scrollRef={viewport} keepMounted={mounted}>{children}</Virtualizer>
        : empty}
    </MessageScrollerContent>
  </MessageScrollerViewport>;
}

export type { VirtualMessageListProps };
