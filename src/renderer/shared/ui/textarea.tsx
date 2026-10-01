import type { ComponentProps } from "react";
import { cn } from "../utils";
import { controlStyle } from "./input";

// 基于 shadcn/ui Textarea（MIT）。
export function Textarea({ className, variant = "default", ...props }: ComponentProps<"textarea"> & { variant?: "default" | "plain" }) {
  return <textarea data-slot="textarea" className={cn(controlStyle, "flex min-h-16 w-full resize-y px-2 py-1.5 leading-relaxed",
    variant === "plain" && "rounded-none border-0 bg-transparent shadow-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
    className)} {...props} />;
}
