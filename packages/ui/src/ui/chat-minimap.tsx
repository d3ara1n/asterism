import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import "./chat-minimap.css";

export interface ChatMinimapItem {
  id: string;
  label: string;
  preview: string;
}

/** 贴在阅读区边缘的用户消息导航；消息投影与正文滚动由调用方负责。 */
export function ChatMinimap({ items, label, onSelect }: {
  items: readonly ChatMinimapItem[];
  label: string;
  onSelect(id: string): void;
}) {
  const rail = useRef<HTMLElement>(null);
  const focusFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(focusFrame.current), []);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<string | null>(null);
  const activeIndex = items.findIndex(item => item.id === (hovered ?? focused ?? previewed));
  const focusIndex = Math.max(0, items.findIndex(item => item.id === focused));

  const navigate = (event: KeyboardEvent<HTMLElement>) => {
    const index = items.findIndex(item => item.id === focused);
    if (index < 0) return;
    const next = event.key === "ArrowDown" ? Math.min(items.length - 1, index + 1)
      : event.key === "ArrowUp" ? Math.max(0, index - 1)
        : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    const container = rail.current;
    const button = container?.querySelectorAll<HTMLButtonElement>("[data-minimap-item]")[next];
    if (!container || !button) return;
    setHovered(null);
    cancelAnimationFrame(focusFrame.current);
    // 只移动柱列自身，避免键盘聚焦带动画布或正文滚动。
    if (button.offsetTop < container.scrollTop) container.scrollTop = button.offsetTop;
    else if (button.offsetTop + button.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = button.offsetTop + button.offsetHeight - container.clientHeight;
    }
    // 滚动事件会关闭 Tooltip，待柱列完成滚动后再聚焦并打开预览。
    focusFrame.current = requestAnimationFrame(() => {
      if (container.contains(document.activeElement)) button.focus({ preventScroll: true });
    });
  };

  if (!items.length) return null;
  return <div className="pointer-events-none absolute inset-y-3 left-0 z-10 flex items-center">
    <TooltipProvider delayDuration={180} skipDelayDuration={300}>
      <nav ref={rail} aria-label={label} className="chat-minimap pointer-events-auto relative max-h-full overflow-x-hidden overflow-y-auto overscroll-contain"
        data-active={activeIndex >= 0 ? "" : undefined} onPointerLeave={() => setHovered(null)} onKeyDown={navigate}>
        {items.map((item, index) => {
          const distance = activeIndex < 0 ? Infinity : Math.abs(index - activeIndex);
          const lens = distance > 3 ? 0 : (1 + Math.cos(distance * Math.PI / 4)) / 2;
          return <Tooltip key={item.id} onOpenChange={open => {
            setPreviewed(current => open ? item.id : current === item.id ? null : current);
          }}>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" data-minimap-item="" aria-label={item.label}
                tabIndex={index === focusIndex ? 0 : -1}
                className="flex h-2 w-full justify-start rounded-none p-0 hover:bg-transparent focus-visible:ring-inset dark:hover:bg-transparent"
                style={{ "--minimap-lens": lens } as CSSProperties}
                onPointerEnter={() => setHovered(item.id)}
                onMouseDown={event => event.preventDefault()}
                onFocus={() => setFocused(item.id)} onBlur={() => setFocused(null)}
                onClick={() => onSelect(item.id)}>
                <span aria-hidden="true" className="chat-minimap-marker block h-0.5 shrink-0 bg-muted-foreground" />
              </Button>
            </TooltipTrigger>
            {/* Tooltip 自行在祖先滚动时关闭；不启用会把避让留白计入短柱裁切的 hideWhenDetached。 */}
            <TooltipContent side="right" sideOffset={8} collisionPadding={12}
              className="max-h-(--radix-tooltip-content-available-height) w-72 max-w-(--radix-tooltip-content-available-width) overflow-hidden text-left text-wrap">
              <p className="mb-1 font-medium">{item.label}</p>
              <p className="line-clamp-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.preview}</p>
            </TooltipContent>
          </Tooltip>;
        })}
      </nav>
    </TooltipProvider>
  </div>;
}
