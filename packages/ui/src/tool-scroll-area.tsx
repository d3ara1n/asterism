import { ScrollArea, type ScrollAreaProps } from "./ui/scroll-area";
import { cn } from "./utils";

/** One bounded reading region; padding clears overlay thumbs and keeps descendant focus rings inside the viewport. */
export function ToolScrollArea({ className, viewportClassName, contentClassName, ...props }: Omit<ScrollAreaProps, "type" | "orientation">) {
  // Radix's auto scrollbar mounts only on overflow, so short results still pass wheel scrolling to the conversation.
  return <ScrollArea {...props} type="auto"
    className={cn("-m-1 max-h-96 [&:has(>[data-slot=scroll-area-scrollbar])>[data-slot=scroll-area-viewport]]:overscroll-y-contain", className)}
    viewportClassName={cn("h-auto overscroll-auto focus-visible:outline-offset-[-2px]", viewportClassName)} contentClassName={cn("p-1 pr-3 wrap-anywhere", contentClassName)} />;
}
