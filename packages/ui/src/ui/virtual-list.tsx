import { useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type Ref } from "react";
import { Virtualizer, type VirtualizerHandle, type VirtualizerProps } from "virtua";
import { ScrollArea } from "./scroll-area";
import { cn } from "../utils";

type VirtualListProps<T> = Omit<VirtualizerProps<T>, "scrollRef"> & {
  ref?: Ref<VirtualizerHandle>;
  className?: string;
  style?: CSSProperties;
  viewportClassName?: string;
  viewportProps?: ComponentProps<"div">;
};

/** One viewport for Radix's overlay scrollbar and virtua's measurements and scroll compensation. */
function VirtualList<T>({ className, style, viewportClassName, viewportProps, horizontal, startMargin, ...props }: VirtualListProps<T>) {
  const scroll = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport || startMargin !== undefined) return;
    const measure = () => {
      const computed = getComputedStyle(viewport);
      const padding = horizontal
        ? computed.direction === "rtl" ? computed.paddingRight : computed.paddingLeft
        : computed.paddingTop;
      setInset(parseFloat(padding));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [horizontal, startMargin, viewportClassName, viewportProps?.className, viewportProps?.style]);
  return <ScrollArea className={cn("min-h-0 min-w-0 flex-1", className)} style={style}
    orientation={horizontal ? "horizontal" : "vertical"}
    viewportRef={scroll} viewportClassName={cn("[overflow-anchor:none]", viewportClassName)} viewportProps={viewportProps}>
    {/* Viewport padding precedes the list in scroll coordinates, even without a separate header. */}
    <Virtualizer {...props} startMargin={startMargin ?? inset} horizontal={horizontal} scrollRef={scroll} />
  </ScrollArea>;
}

export { VirtualList };
export type { VirtualListProps };
