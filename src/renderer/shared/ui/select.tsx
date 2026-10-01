import type { ComponentProps } from "react";
import { Select as Primitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "../utils";
import { controlStyle } from "./input";

// 基于 shadcn/ui Select（MIT）；下拉面板与菜单共用浮层外观。
export const Select = (props: ComponentProps<typeof Primitive.Root>) => <Primitive.Root data-slot="select" {...props} />;
export const SelectGroup = (props: ComponentProps<typeof Primitive.Group>) => <Primitive.Group data-slot="select-group" {...props} />;
export const SelectValue = (props: ComponentProps<typeof Primitive.Value>) => <Primitive.Value data-slot="select-value" {...props} />;

export function SelectTrigger({ className, size = "default", children, ...props }: ComponentProps<typeof Primitive.Trigger> & { size?: "sm" | "default" }) {
  return <Primitive.Trigger data-slot="select-trigger" data-size={size}
    className={cn(controlStyle, "flex w-full items-center justify-between gap-2 whitespace-nowrap px-2 data-[size=default]:h-7 data-[size=sm]:h-6 data-[placeholder]:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground", className)} {...props}>
    {children}
    <Primitive.Icon asChild><ChevronDownIcon /></Primitive.Icon>
  </Primitive.Trigger>;
}

export function SelectContent({ className, children, position = "popper", ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Content data-slot="select-content" position={position} sideOffset={4}
      className={cn("menu-content relative max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-y-auto", position === "popper" && "w-(--radix-select-trigger-width)", className)} {...props}>
      <Primitive.ScrollUpButton className="flex items-center justify-center py-1 [&_svg]:size-3.5"><ChevronUpIcon /></Primitive.ScrollUpButton>
      <Primitive.Viewport>{children}</Primitive.Viewport>
      <Primitive.ScrollDownButton className="flex items-center justify-center py-1 [&_svg]:size-3.5"><ChevronDownIcon /></Primitive.ScrollDownButton>
    </Primitive.Content>
  </Primitive.Portal>;
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label data-slot="select-label" className={cn("type-label px-2 py-1.5", className)} {...props} />;
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item data-slot="select-item" className={cn("menu-item relative w-full pr-7", className)} {...props}>
    <span className="absolute right-2 flex size-3.5 items-center justify-center"><Primitive.ItemIndicator><CheckIcon className="size-3.5 text-primary" /></Primitive.ItemIndicator></span>
    <Primitive.ItemText>{children}</Primitive.ItemText>
  </Primitive.Item>;
}

export function SelectSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)} {...props} />;
}
