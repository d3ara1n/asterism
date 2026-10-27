import * as React from "react"
import { RotateCcw } from "lucide-react"

import { cn } from "../utils"
import { IconButton } from "./icon-button"
import { formatNumberText, limitNumber, parseNumberText, stepNumber } from "../number-input-value"

/**
 * Single-field number control: enter arbitrary decimals directly and adjust with arrow keys (Shift ×10, Alt ×0.1).
 * Commit on Enter or blur, rounding by precision and clamping to bounds; clearing or restoring returns to defaultValue, and Escape discards edits.
 * When value is null, emptyLabel appears as placeholder text and is read by assistive technology as the current value.
 */
function NumberInput({
  value, defaultValue, onValueChange, min, max, step = 1, precision = 2, unit, emptyLabel, locale, label, resetLabel, className,
}: {
  value: number | null
  /** Target value for clearing and restoring; null returns to the emptyLabel state. */
  defaultValue: number | null
  onValueChange: (value: number | null) => void
  min: number
  max: number
  step?: number
  /** Number of decimal places to retain. */
  precision?: number
  unit?: string
  emptyLabel?: string
  locale: string
  label: string
  resetLabel: string
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Display the new value immediately after submission without waiting for the external save round trip.
  const [current, setCurrent] = React.useState(value)
  React.useEffect(() => { setCurrent(value) }, [value])
  const [editing, setEditing] = React.useState<string | null>(null)

  const formatted = current === null ? "" : formatNumberText(current, locale)
  const text = editing ?? formatted

  const apply = (next: number | null) => {
    setCurrent(next)
    if (next !== value) onValueChange(next)
  }
  const commit = () => {
    if (editing === null) return
    const parsed = parseNumberText(editing)
    setEditing(null)
    if (parsed === undefined) return
    apply(parsed === null ? defaultValue : limitNumber(parsed, min, max, precision))
  }
  const nudge = (direction: 1 | -1, event: React.KeyboardEvent) => {
    const amount = event.altKey ? step / 10 : event.shiftKey ? step * 10 : step
    const typed = editing === null ? current : parseNumberText(editing)
    // Empty values step from defaultValue; without a numeric default, they start from the lower bound.
    const base = typeof typed === "number" ? typed : defaultValue ?? min
    setEditing(null)
    apply(stepNumber(base, direction * amount, min, max, precision))
  }

  return <div className={cn(
    "flex h-8 w-28 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
    "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
    className,
  )}>
    <input ref={inputRef} type="text" inputMode="decimal" role="spinbutton" spellCheck={false} autoComplete="off"
      aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={current ?? undefined}
      aria-valuetext={current === null ? emptyLabel : unit ? `${formatted} ${unit}` : undefined}
      value={text} placeholder={emptyLabel}
      className="h-full min-w-0 flex-1 bg-transparent pl-2.5 text-sm tabular-nums outline-none placeholder:text-muted-foreground"
      onFocus={event => event.currentTarget.select()}
      onChange={event => setEditing(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === "Enter") { event.preventDefault(); commit() }
        else if (event.key === "Escape" && editing !== null) { event.preventDefault(); event.stopPropagation(); setEditing(null) }
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); nudge(event.key === "ArrowUp" ? 1 : -1, event) }
      }} />
    {unit && (editing !== null || current !== null) && <span aria-hidden="true" className="pr-1.5 text-xs text-muted-foreground">{unit}</span>}
    {current !== defaultValue && editing === null && <IconButton size="icon-xs" label={resetLabel} className="mr-0.5 text-muted-foreground"
      onClick={() => { apply(defaultValue); inputRef.current?.focus() }}><RotateCcw /></IconButton>}
  </div>
}

export { NumberInput }
