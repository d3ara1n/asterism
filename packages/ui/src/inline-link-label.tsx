import type { ReactNode } from "react";

/** Reserve icon space on the first inline fragment without adding a line break opportunity before the label. */
export function InlineLinkLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className={icon ? "relative ps-4.5" : undefined}>
    {icon && <span className="absolute inset-s-0 top-[0.125em] size-3.5" aria-hidden>{icon}</span>}{children}
  </span>;
}
