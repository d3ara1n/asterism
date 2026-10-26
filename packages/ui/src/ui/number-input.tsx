import * as React from "react"
import { RotateCcw } from "lucide-react"

import { cn } from "../utils"
import { IconButton } from "./icon-button"
import { formatNumberText, limitNumber, parseNumberText, stepNumber } from "../number-input-value"

/**
 * 单输入框数字控件：直接输入任意小数，方向键调整（Shift ×10，Alt ×0.1）。
 * Enter 或失焦时提交，按 precision 舍入并限制到边界；清空或还原按钮回到 defaultValue，Escape 放弃编辑。
 * value 为 null 时以占位文字显示 emptyLabel，辅助技术读作当前值。
 */
function NumberInput({
  value, defaultValue, onValueChange, min, max, step = 1, precision = 2, unit, emptyLabel, locale, label, resetLabel, className,
}: {
  value: number | null
  /** 清空与还原的目标值；null 表示回到 emptyLabel 状态。 */
  defaultValue: number | null
  onValueChange: (value: number | null) => void
  min: number
  max: number
  step?: number
  /** 保留的小数位数。 */
  precision?: number
  unit?: string
  emptyLabel?: string
  locale: string
  label: string
  resetLabel: string
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  // 提交后先显示新值，不等待外部保存往返。
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
    // 空值从 defaultValue 起步；无默认数值时从下限起步。
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
