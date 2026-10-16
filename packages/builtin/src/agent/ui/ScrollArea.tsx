import type { AgentScrollAreaProps } from "@atelier/builtin-api/renderer";
import { cn } from "@atelier/ui/utils";

/** 同一视口负责滚动和焦点光圈留白；负边距保持正文与固定区域对齐。 */
export function ScrollArea({ axis = "vertical", className, ...props }: AgentScrollAreaProps) {
  return <div {...props} className={cn(
    "-m-1 min-h-0 p-1",
    axis === "vertical" ? "overflow-y-auto" : axis === "horizontal" ? "overflow-x-auto" : "overflow-auto",
    className,
  )} />;
}
