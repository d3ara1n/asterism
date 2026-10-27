import type { ReactNode } from "react";
import { cn } from "./utils";

/** Tool headers consistently use one line: names and paths yield space, while the trailing summary stays visible and right-aligned. */
export function ToolHeader({ label, subject, badge, meta, monospace = false }: {
  label: string;
  subject?: string;
  badge?: ReactNode;
  meta?: ReactNode;
  monospace?: boolean;
}) {
  return <span className={cn("grid min-w-0 w-full items-baseline gap-x-2 text-left",
    badge ? "grid-cols-[auto_auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]")}>
    <span className="min-w-0 truncate" title={label}>{label}</span>
    {badge && <span className="min-w-0 max-w-32 self-center">{badge}</span>}
    <span className={cn("min-w-0 truncate", monospace && "font-mono")} title={subject}>{subject}</span>
    <span className="whitespace-nowrap text-right type-caption tabular-nums">{meta}</span>
  </span>;
}
