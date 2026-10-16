import type { ReactNode } from "react";
import { cn } from "./utils";

/** 工具标题统一单行：名称和路径让出空间，尾部摘要保持可见并右对齐。 */
export function ToolHeader({ label, subject, meta, monospace = false }: {
  label: string;
  subject?: string;
  meta?: ReactNode;
  monospace?: boolean;
}) {
  return <span className="grid min-w-0 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 text-left">
    <span className="min-w-0 truncate" title={label}>{label}</span>
    <span className={cn("min-w-0 truncate", monospace && "font-mono")} title={subject}>{subject}</span>
    <span className="whitespace-nowrap text-right type-caption tabular-nums">{meta}</span>
  </span>;
}
