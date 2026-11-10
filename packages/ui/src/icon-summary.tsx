import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fitSummaryItems } from "./icon-summary-layout";

export interface IconSummaryItem {
  key: string;
  icon: ReactNode;
  label: string;
  count?: number;
}

function Item({ item }: { item: IconSummaryItem }) {
  return <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums [&_svg]:size-3.5">
    {item.icon}{item.count !== undefined && item.count > 1 && <span className="text-xs">{item.count}</span>}
  </span>;
}

/** One line of complete items; hidden items are represented by a single trailing ellipsis. */
export function IconSummary({ items }: { items: readonly IconSummaryItem[] }) {
  const container = useRef<HTMLSpanElement>(null);
  const measurement = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(0);
  useLayoutEffect(() => {
    const root = container.current!, row = measurement.current!;
    const measure = () => {
      const widths = Array.from(row.children, child => child.getBoundingClientRect().width);
      const ellipsis = widths.pop()!;
      const gap = parseFloat(getComputedStyle(row).columnGap);
      setVisible(fitSummaryItems(widths, root.clientWidth, gap, ellipsis));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(row);
    return () => observer.disconnect();
  }, [items]);
  return <span ref={container} className="relative block min-w-0 w-full overflow-hidden">
    <span className="sr-only">{items.map(item => item.label + (item.count && item.count > 1 ? ` ×${item.count}` : "")).join(" · ")}</span>
    <span aria-hidden="true" className="flex items-center gap-2">
      {items.slice(0, visible).map(item => <Item key={item.key} item={item} />)}
      {visible < items.length && <span className="shrink-0">…</span>}
    </span>
    <span ref={measurement} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-2">
      {items.map(item => <Item key={item.key} item={item} />)}
      <span className="shrink-0">…</span>
    </span>
  </span>;
}
