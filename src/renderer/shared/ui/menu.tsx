import type { ComponentProps, ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { cn } from "../utils";

// 基于 shadcn/ui DropdownMenu（MIT）；Radix 管理键盘导航与焦点返回。
export function Menu({ trigger, children, align = "start" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={8} className="menu-content">{children}</DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return <DropdownMenu.Item className={cn("menu-item [&_svg]:size-3.5 [&_svg]:text-muted-foreground", className)} {...props} />;
}
export function MenuSeparator() {
  return <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />;
}
