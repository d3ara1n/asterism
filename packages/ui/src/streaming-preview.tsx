import type { ReactNode } from "react";

/** Shared tail window for streaming bodies: fixed height with a top fade, and content moves upward naturally with layout. */
export function StreamingPreview({ children }: { children: ReactNode }) {
  return <div className="flex h-32 flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)]" inert aria-hidden="true">
    <div className="min-w-0 shrink-0">{children}</div>
  </div>;
}
