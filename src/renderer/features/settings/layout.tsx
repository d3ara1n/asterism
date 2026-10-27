import type { ReactNode } from "react";
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from "@asterism/ui/ui/item";

/** Settings group: title + rounded group surface, with dividers between rows. */
export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-6 first:mt-2">
    <div className="mb-2 flex items-end justify-between gap-4 px-1">
      <div><h3 className="type-section">{title}</h3>{hint && <p className="type-caption mt-0.5">{hint}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

/** Settings row within a group surface: label and description on the left, control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <Item>
    <ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent>
    <ItemActions>{children}</ItemActions>
  </Item>;
}
