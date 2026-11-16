import type { ReactNode } from "react";
import { cn } from "./utils";
import { TooltipHint } from "./tooltip-hint";
import { Badge } from "./ui/badge";

/** Optional rich-content slots provide defaults, not content restrictions: a subject badge, a shrinkable summary, and trailing metadata. */
export function ToolHeader({ label, subject, summary, meta }: {
  label: string;
  subject?: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
}) {
  const hasSubject = subject != null && subject !== false && subject !== "";
  return <span className={cn("grid min-w-0 w-full items-baseline gap-x-2 text-left",
    hasSubject ? "grid-cols-[auto_auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]")}>
    <TooltipHint content={label}><span className="min-w-0 truncate">{label}</span></TooltipHint>
    {hasSubject && <Badge variant="secondary" className="min-w-0 max-w-48 self-center py-0 font-normal text-muted-foreground">
      <TooltipHint content={typeof subject === "string" ? subject : undefined}><span className="min-w-0 truncate">{subject}</span></TooltipHint>
    </Badge>}
    <TooltipHint content={typeof summary === "string" ? summary : undefined}><span className="min-w-0 self-center truncate text-muted-foreground">{summary}</span></TooltipHint>
    <span className="whitespace-nowrap text-right type-caption tabular-nums text-muted-foreground">{meta}</span>
  </span>;
}
