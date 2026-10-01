import type { ComponentProps } from "react";
import { Separator as Primitive } from "radix-ui";
import { cn } from "../utils";

// 基于 shadcn/ui Separator（MIT）。
export function Separator({ className, orientation = "horizontal", decorative = true, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="separator" decorative={decorative} orientation={orientation}
    className={cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", className)} {...props} />;
}
