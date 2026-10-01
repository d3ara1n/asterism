import type { ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

// 基于 shadcn/ui Button（MIT），使用本项目设计 token。
const variants = cva("inline-flex shrink-0 items-center justify-center gap-1 rounded-control text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "bg-secondary text-foreground hover:bg-secondary/70",
      ghost: "hover:bg-secondary text-foreground",
    },
    size: { default: "h-7 px-2.5", sm: "h-6 px-2 text-xs", icon: "size-6" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({ className, variant, size, asChild = false, ...props }: ComponentProps<"button"> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(variants({ variant, size }), className)} {...props} />;
}
