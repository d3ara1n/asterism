import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../utils";

// 基于 shadcn/ui Badge（MIT）；变体对应项目语义色。
export const badgeVariants = cva("inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3", {
  variants: { variant: {
    secondary: "bg-secondary text-muted-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    destructive: "bg-destructive-soft text-destructive",
    outline: "text-foreground ring-1 ring-border",
  } },
  defaultVariants: { variant: "secondary" },
});
export function Badge({ className, variant, asChild = false, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "span";
  return <Component data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}
