import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

// 基于 shadcn/ui Alert（MIT）；用于页内提示条。
const alertVariants = cva("grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-control px-3 py-2 text-xs has-[>svg]:grid-cols-[calc(var(--spacing)*3.5)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-3.5 [&>svg]:translate-y-px [&>svg]:text-current", {
  variants: { variant: {
    default: "bg-secondary text-foreground",
    warning: "bg-warning-soft text-warning",
    destructive: "bg-destructive-soft text-destructive",
  } },
  defaultVariants: { variant: "default" },
});
export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-medium", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("col-start-2 leading-relaxed", className)} {...props} />;
}
