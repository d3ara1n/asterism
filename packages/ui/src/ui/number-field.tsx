"use client";

import * as React from "react";
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "../utils";

type StyledProps<T extends React.ElementType> = Omit<React.ComponentProps<T>, "className"> & { className?: string };

function NumberField({
  className,
  ...props
}: StyledProps<typeof NumberFieldPrimitive.Root>) {
  return (
    <NumberFieldPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function NumberFieldScrubArea({
  className,
  ...props
}: StyledProps<typeof NumberFieldPrimitive.ScrubArea>) {
  return (
    <NumberFieldPrimitive.ScrubArea
      className={cn("cursor-ew-resize select-none", className)}
      {...props}
    />
  );
}

function NumberFieldGroup({
  className,
  size = "default",
  ...props
}: StyledProps<typeof NumberFieldPrimitive.Group> & { size?: "default" | "sm" }) {
  return (
    <NumberFieldPrimitive.Group
      data-size={size}
      className={cn(
        "group/number-field flex h-9 w-fit items-stretch overflow-hidden rounded-md border border-input shadow-xs transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[size=sm]:h-8",
        className,
      )}
      {...props}
    />
  );
}

const stepperClasses =
  "flex w-9 items-center justify-center bg-muted/50 text-muted-foreground transition-colors select-none hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 group-data-[size=sm]/number-field:w-7 [&_svg]:size-4";

function NumberFieldDecrement({
  className,
  children = <MinusIcon aria-hidden="true" />,
  ...props
}: StyledProps<typeof NumberFieldPrimitive.Decrement>) {
  return (
    <NumberFieldPrimitive.Decrement
      className={cn(stepperClasses, "border-r border-input", className)}
      {...props}
    >
      {children}
    </NumberFieldPrimitive.Decrement>
  );
}

function NumberFieldInput({
  className,
  ...props
}: StyledProps<typeof NumberFieldPrimitive.Input>) {
  return (
    <NumberFieldPrimitive.Input
      className={cn(
        "w-16 bg-transparent text-center text-sm tabular-nums outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function NumberFieldIncrement({
  className,
  children = <PlusIcon aria-hidden="true" />,
  ...props
}: StyledProps<typeof NumberFieldPrimitive.Increment>) {
  return (
    <NumberFieldPrimitive.Increment
      className={cn(stepperClasses, "border-l border-input", className)}
      {...props}
    >
      {children}
    </NumberFieldPrimitive.Increment>
  );
}

export {
  NumberField,
  NumberFieldScrubArea,
  NumberFieldGroup,
  NumberFieldDecrement,
  NumberFieldInput,
  NumberFieldIncrement,
};
