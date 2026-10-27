import type { AgentScrollAreaProps } from "@asterism-app/builtin-api/renderer";
import { cn } from "@asterism-app/ui/utils";

/** The same viewport handles scrolling and focus-ring clearance; negative margins align body content with fixed areas. */
export function ScrollArea({ axis = "vertical", className, ...props }: AgentScrollAreaProps) {
  return <div {...props} className={cn(
    "-m-1 min-h-0 p-1",
    axis === "vertical" ? "overflow-y-auto" : axis === "horizontal" ? "overflow-x-auto" : "overflow-auto",
    className,
  )} />;
}
