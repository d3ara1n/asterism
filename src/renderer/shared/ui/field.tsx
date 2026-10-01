import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { Label } from "./label";

// 基于 shadcn/ui Field（MIT）：表单布局统一用 FieldGroup + Field。
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("group/field-group flex w-full flex-col gap-5", className)} {...props} />;
}
export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return <fieldset data-slot="field-set" className={cn("flex flex-col gap-4", className)} {...props} />;
}
export function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return <legend data-slot="field-legend" className={cn("type-section mb-2", className)} {...props} />;
}
const fieldVariants = cva("group/field flex w-full gap-1.5 data-[invalid=true]:text-destructive", {
  variants: { orientation: {
    vertical: "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
    horizontal: "flex-row items-center justify-between gap-6 [&>[data-slot=field-content]]:flex-1",
  } },
  defaultVariants: { orientation: "vertical" },
});
export function Field({ className, orientation = "vertical", ...props }: ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return <div role="group" data-slot="field" data-orientation={orientation} className={cn(fieldVariants({ orientation }), className)} {...props} />;
}
export function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field-content" className={cn("flex min-w-0 flex-col gap-0.5 leading-snug", className)} {...props} />;
}
export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("leading-snug group-data-[disabled=true]/field:opacity-45", className)} {...props} />;
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("type-caption", className)} {...props} />;
}
export function FieldError({ className, ...props }: ComponentProps<"div">) {
  if (!props.children) return null;
  return <div role="alert" data-slot="field-error" className={cn("text-xs text-destructive", className)} {...props} />;
}
