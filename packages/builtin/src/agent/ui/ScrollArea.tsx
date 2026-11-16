import type { AgentScrollAreaProps } from "@asterism-app/builtin-api/renderer";
import { ScrollArea as OverlayScrollArea } from "@asterism-app/ui/ui/scroll-area";
import { cn } from "@asterism-app/ui/utils";

/** Sizing belongs to the frame; the public div ref and events address the scrolling viewport. */
export function ScrollArea({ axis = "vertical", className, style, ref, children, ...props }: AgentScrollAreaProps) {
  return <OverlayScrollArea orientation={axis} className={cn("-m-1", className)} style={style}
    viewportRef={ref} viewportProps={props} contentClassName="p-1">
    {children}
  </OverlayScrollArea>;
}
