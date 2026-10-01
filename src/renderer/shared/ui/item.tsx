import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../utils";
import { Separator } from "./separator";

// 基于 shadcn/ui Item（MIT）：列表行、设置分组行。
export function ItemGroup({ className, ...props }: ComponentProps<"div">) {
  return <div role="list" data-slot="item-group" className={cn("group/item-group flex flex-col overflow-hidden rounded-surface bg-card ring-1 ring-surface-ring", className)} {...props} />;
}
export function ItemSeparator({ className, ...props }: ComponentProps<typeof Separator>) {
  return <Separator data-slot="item-separator" className={cn("mx-3 w-auto! bg-border/70", className)} {...props} />;
}
const itemVariants = cva("group/item flex items-center gap-3 text-sm outline-none transition-colors [a&]:hover:bg-secondary/60 [button&]:w-full [button&]:text-left [button&]:hover:bg-secondary/60 aria-pressed:bg-secondary aria-pressed:hover:bg-secondary", {
  variants: {
    variant: { default: "bg-transparent", outline: "rounded-control ring-1 ring-surface-ring", muted: "rounded-control bg-secondary/50" },
    size: { default: "min-h-12 px-3 py-2.5", sm: "min-h-9 px-3 py-1.5" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Item({ className, variant, size, asChild = false, ...props }: ComponentProps<"div"> & VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "div";
  return <Component data-slot="item" className={cn(itemVariants({ variant, size }), className)} {...props} />;
}
export function ItemMedia({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-media" className={cn("flex size-8 shrink-0 items-center justify-center rounded-control bg-secondary text-primary [&_svg]:size-4", className)} {...props} />;
}
export function ItemContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)} {...props} />;
}
export function ItemTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-title" className={cn("truncate font-medium leading-snug", className)} {...props} />;
}
export function ItemDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="item-description" className={cn("type-caption line-clamp-2", className)} {...props} />;
}
export function ItemActions({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("flex shrink-0 items-center gap-2", className)} {...props} />;
}
