import type { ComponentProps } from "react";
import { Switch as Primitive } from "radix-ui";
import { cn } from "../utils";

// 基于 shadcn/ui Switch（MIT）；Radix 管理键盘与 role="switch" 语义。
export function Switch({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="switch" className={cn("peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors disabled:opacity-45 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border", className)} {...props}>
    <Primitive.Thumb data-slot="switch-thumb" className="pointer-events-none block size-4 rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0" />
  </Primitive.Root>;
}
