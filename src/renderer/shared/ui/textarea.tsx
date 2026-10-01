import type { ComponentProps } from "react";
import { cn } from "../utils";
import { controlStyle } from "./input";

// 基于 shadcn/ui Textarea（MIT）。
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(controlStyle, "flex min-h-16 w-full resize-y px-2 py-1.5 leading-relaxed", className)} {...props} />;
}
