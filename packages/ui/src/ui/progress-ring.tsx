import * as React from "react"
import { cn } from "../utils"

/**
 * Circular progress drawn on the 24-unit icon grid in `currentColor`.
 * A number from 0 to 1 fills the arc; `"indeterminate"` spins a short arc for work in progress;
 * `null` draws a static dashed track for a quantity that has no measurement.
 */
function ProgressRing({ value, className, ...props }: Omit<React.ComponentProps<"svg">, "children"> & {
  value: number | "indeterminate" | null
}) {
  const spinning = value === "indeterminate"
  const filled = typeof value === "number" ? Math.min(Math.max(value, 0), 1) * 100 : spinning ? 25 : 0
  return (
    <svg
      data-slot="progress-ring"
      data-state={value === null ? "unknown" : spinning ? "indeterminate" : "determinate"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className={cn("size-4 shrink-0 -rotate-90", spinning && "animate-spin motion-reduce:animate-none", className)}
      {...props}
    >
      {value === null
        ? <circle cx={12} cy={12} r={10} pathLength={100} strokeDasharray="4 4.333" className="opacity-50" />
        : <>
          <circle cx={12} cy={12} r={10} className="opacity-25" />
          {filled > 0 && <circle cx={12} cy={12} r={10} pathLength={100} strokeLinecap="round" strokeDasharray="100 100"
            strokeDashoffset={100 - filled} className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none" />}
        </>}
    </svg>
  )
}

export { ProgressRing }
