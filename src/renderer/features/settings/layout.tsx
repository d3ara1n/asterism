import type { ReactNode } from "react";
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from "@atelier/ui/ui/item";

/** 设置分组：标题 + 圆角分组底板，行之间用分隔线。 */
export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-6 first:mt-2">
    <div className="mb-2 flex items-end justify-between gap-4 px-1">
      <div><h3 className="type-section">{title}</h3>{hint && <p className="type-caption mt-0.5">{hint}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

/** 分组底板内的设置行：左侧标签与说明，右侧控件。 */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <Item>
    <ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent>
    <ItemActions>{children}</ItemActions>
  </Item>;
}
