import type { ComponentProps } from "react";
import { Label as Primitive } from "radix-ui";
import { cn } from "../utils";

// 基于 shadcn/ui Label（MIT）。
export function Label({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="label" className={cn("flex select-none items-center gap-2 text-sm font-medium leading-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-45 peer-disabled:opacity-45", className)} {...props} />;
}
