import type { ReactNode } from "react";
import { cn } from "./utils";
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
    <span className="min-w-0 truncate" title={label}>{label}</span>
    {hasSubject && <Badge variant="secondary" className="min-w-0 max-w-48 self-center py-0 font-normal text-muted-foreground">
      <span className="min-w-0 truncate" title={typeof subject === "string" ? subject : undefined}>{subject}</span>
    </Badge>}
    <span className="min-w-0 self-center truncate text-muted-foreground" title={typeof summary === "string" ? summary : undefined}>{summary}</span>
    <span className="whitespace-nowrap text-right type-caption tabular-nums text-muted-foreground">{meta}</span>
  </span>;
}
