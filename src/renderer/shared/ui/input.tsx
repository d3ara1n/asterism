import type { ComponentProps } from "react";
import { cn } from "../utils";

/** 输入类控件共用外观：实色背景、悬停、聚焦、错误、禁用。焦点轮廓由全局 :focus-visible 提供。 */
export const controlStyle = "rounded-control border border-border bg-card text-sm shadow-xs outline-none transition-[border-color,background-color] placeholder:text-muted-foreground hover:border-ring/50 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive";

// 基于 shadcn/ui Input（MIT）。
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(controlStyle, "h-7 w-full min-w-0 px-2", className)} {...props} />;
}
