import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "../utils"
import { scrollbarPointerCoordinate } from "../scrollbar-coordinates"

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>
  viewportClassName?: string
  viewportProps?: React.ComponentProps<"div">
  contentClassName?: string
  orientation?: "vertical" | "horizontal" | "both"
}

/** Root owns layout; viewportRef and viewportProps address the actual scrolling element. */
function ScrollArea({
  className,
  children,
  viewportRef,
  viewportClassName,
  viewportProps,
  contentClassName,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative min-h-0 min-w-0 overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        disableImplicitContentElement
        {...viewportProps}
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full max-h-[inherit] min-h-0 min-w-0 rounded-[inherit] overscroll-contain outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          viewportClassName,
          viewportProps?.className,
        )}
      >
        {/* Explicit content avoids Radix's implicit table sizing in vertical lists and preserves a full-height empty surface. */}
        <ScrollAreaPrimitive.Content
          className={cn(
            "min-h-full",
            orientation === "vertical" ? "flow-root" : "table",
            contentClassName,
          )}
          style={{ display: undefined }}
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  onPointerDown,
  onPointerMove,
  onPointerUp,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  const drag = React.useRef<{ origin: number; scale: number } | null>(null)
  const geometry = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return orientation === "vertical"
      ? { origin: rect.top, scale: rect.height / element.offsetHeight }
      : { origin: rect.left, scale: rect.width / element.offsetWidth }
  }
  const normalize = (
    event: React.PointerEvent,
    { origin, scale }: { origin: number; scale: number },
  ) => {
    // Only the local synthetic event is adjusted. Radix still owns dragging/capture; native input remains untouched.
    if (orientation === "vertical")
      event.clientY = scrollbarPointerCoordinate(
        event.nativeEvent.clientY,
        origin,
        scale,
      )
    else
      event.clientX = scrollbarPointerCoordinate(
        event.nativeEvent.clientX,
        origin,
        scale,
      )
  }
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "z-10 flex touch-none select-none p-px transition-colors",
        orientation === "vertical"
          ? "h-full w-2.5 border-l border-l-transparent"
          : "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (event.defaultPrevented || event.button !== 0) return
        drag.current = geometry(event.currentTarget)
        normalize(event, drag.current)
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (!event.defaultPrevented && drag.current)
          normalize(event, drag.current)
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        drag.current = null
      }}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        onPointerDownCapture={(event) => {
          const scrollbar = event.currentTarget.parentElement!
          const scale = geometry(scrollbar).scale
          const rect = event.currentTarget.getBoundingClientRect()
          normalize(event, {
            origin: orientation === "vertical" ? rect.top : rect.left,
            scale,
          })
        }}
        className="relative flex-1 rounded-full bg-muted-foreground/35 hover:bg-muted-foreground/55"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
export type { ScrollAreaProps }
