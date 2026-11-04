import * as React from "react"
import { cn } from "../utils"

const ROW = 36

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Drum-style picker for one integer column from 0 to count - 1, used for clock and duration fields.
 * Scrolling snaps to a row and commits when scrolling ends; arrow, Page, Home, and End keys step the value directly.
 * The column is a spinbutton; `format` supplies both the visible row text and the announced value.
 */
function WheelPicker({
  value, count, onValueChange, label, format = String, rows = 3, disabled = false, className,
}: {
  value: number
  count: number
  onValueChange: (value: number) => void
  label: string
  format?: (value: number) => string
  /** Visible rows; odd so the selection sits in the middle. */
  rows?: 3 | 5
  disabled?: boolean
  className?: string
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const mounted = React.useRef(false)
  const valueRef = React.useRef(value)
  valueRef.current = value
  const [offset, setOffset] = React.useState(value * ROW)
  const pad = ((rows - 1) / 2) * ROW
  const clamp = (next: number) => Math.min(count - 1, Math.max(0, next))

  // Follow the owner's value; user scrolling already rests on it, so only initial, external, or keyboard changes move the column.
  React.useLayoutEffect(() => {
    const element = scroller.current
    if (!element || (mounted.current && Math.round(element.scrollTop / ROW) === value)) return
    element.scrollTo({ top: value * ROW, behavior: mounted.current && !prefersReducedMotion() ? "smooth" : "instant" })
    mounted.current = true
  }, [value])

  React.useEffect(() => {
    const element = scroller.current
    if (!element) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOffset(element.scrollTop))
    }
    const onScrollEnd = () => {
      const index = clamp(Math.round(element.scrollTop / ROW))
      if (index !== valueRef.current) onValueChange(index)
    }
    element.addEventListener("scroll", onScroll, { passive: true })
    element.addEventListener("scrollend", onScrollEnd)
    return () => { cancelAnimationFrame(frame); element.removeEventListener("scroll", onScroll); element.removeEventListener("scrollend", onScrollEnd) }
  })

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[event.key]
    const next = step !== undefined ? clamp(value + step) : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null
    if (next === null) return
    event.preventDefault()
    if (next !== value) onValueChange(next)
  }

  // The focus ring sits on the wrapper because the column's fade mask would clip it.
  return <div data-slot="wheel-picker" style={{ height: rows * ROW }} className={cn(
    "relative rounded-lg has-[[role=spinbutton]:focus-visible]:ring-[3px] has-[[role=spinbutton]:focus-visible]:ring-ring/50",
    disabled && "opacity-50", className,
  )}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-lg bg-muted" style={{ top: pad, height: ROW }} />
    <div ref={scroller} role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled || undefined}
      aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={value} aria-valuetext={format(value)}
      onKeyDown={onKeyDown}
      className={cn(
        "relative h-full snap-y snap-mandatory overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        disabled ? "overflow-hidden" : "overflow-y-auto",
      )}
      style={{ paddingBlock: pad, maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)" }}>
      {Array.from({ length: count }, (_, index) => {
        const distance = Math.min(Math.abs(index * ROW - offset) / ROW, 2)
        return <div key={index} aria-hidden="true" onClick={() => { if (!disabled && index !== value) onValueChange(index) }}
          className="flex snap-center items-center justify-center text-xl tabular-nums select-none"
          style={{ height: ROW, opacity: 1 - distance * 0.35, transform: `scale(${1 - distance * 0.08})` }}>
          {format(index)}
        </div>
      })}
    </div>
  </div>
}

export { WheelPicker }
