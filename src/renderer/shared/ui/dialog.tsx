import { useEffect, useRef, type ReactNode } from "react";
import { Dialog as Primitive } from "radix-ui";
import { Button } from "./button";

// 基于 shadcn/ui Dialog（MIT）；Radix 管理焦点、键盘与模态交互。
export function Dialog({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { previousFocus.current = document.activeElement as HTMLElement; }, []);
  return <Primitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Primitive.Portal>
      <Primitive.Overlay className="dialog-overlay fixed inset-0 z-40 bg-foreground/15" />
      <Primitive.Content onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }} className="dialog-content fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-dialog bg-card p-4 shadow-dialog outline-none">
        <div className="flex items-center justify-between gap-4">
          <Primitive.Title className="text-lg font-semibold">{title}</Primitive.Title>
          <Primitive.Close asChild><Button variant="ghost" size="icon" aria-label="Close · 关闭">×</Button></Primitive.Close>
        </div>
        <Primitive.Description className="mb-4 mt-2 text-sm leading-relaxed text-muted-foreground">{description}</Primitive.Description>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
