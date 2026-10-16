import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { cn } from "../utils"
import { Button } from "./button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "./command"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Switch } from "./switch"

/** Local Font Access API（Chromium）；TS 标准库尚未收录。 */
type LocalFont = { family: string }
declare global { interface Window { queryLocalFonts?: () => Promise<LocalFont[]> } }

type FontList = { families: string[]; available: boolean }
let cache: Promise<FontList> | null = null

/** 枚举本机字体家族，按名称去重排序；不可用或被拒绝时返回空列表。全进程只查询一次。 */
function loadFonts(): Promise<FontList> {
  cache ??= (async () => {
    if (!window.queryLocalFonts) return { families: [], available: false }
    try {
      const fonts = await window.queryLocalFonts()
      const families = [...new Set(fonts.map(font => font.family).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      return { families, available: true }
    } catch (error) {
      console.error("Local fonts could not be queried.", error)
      cache = null
      return { families: [], available: false }
    }
  })()
  return cache
}

const monoCache = new Map<string, boolean>()
let context: CanvasRenderingContext2D | null = null
/** 窄字与宽字等宽即视为等宽字体；未安装的字体会落到回退字体，结果按回退判定。 */
function isMonospace(family: string): boolean {
  const known = monoCache.get(family)
  if (known !== undefined) return known
  context ??= document.createElement("canvas").getContext("2d")
  if (!context) return true
  context.font = `16px "${family.replace(/[\\"]/g, "\\$&")}", serif`
  const result = Math.abs(context.measureText("iiiiiiii").width - context.measureText("WWWWWWWW").width) < 0.5
  monoCache.set(family, result)
  return result
}

export interface FontPickerProps {
  /** null 表示系统默认。 */
  value: string | null
  onValueChange: (value: string | null) => void
  /** 默认只列等宽字体，可切换显示全部。 */
  monospaceOnly?: boolean
  defaultLabel: string
  searchPlaceholder: string
  emptyText: string
  unavailableText: string
  showAllLabel?: string
  "aria-label"?: string
  className?: string
}

/** 本机字体选择：可搜索的下拉列表，每项以自身字体渲染；首项为系统默认。 */
export function FontPicker({ value, onValueChange, monospaceOnly = false, defaultLabel, searchPlaceholder, emptyText, unavailableText, showAllLabel, className, ...props }: FontPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [fonts, setFonts] = React.useState<FontList | null>(null)
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    if (!open || fonts) return
    let alive = true
    void loadFonts().then(list => { if (alive) setFonts(list) })
    return () => { alive = false }
  }, [open, fonts])

  const families = React.useMemo(() => {
    const all = fonts?.families ?? []
    return monospaceOnly && !showAll ? all.filter(isMonospace) : all
  }, [fonts, monospaceOnly, showAll])

  const choose = (next: string | null) => { onValueChange(next); setOpen(false) }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label={props["aria-label"]}
        className={cn("w-56 justify-between font-normal", className)}>
        <span className="truncate" style={value ? { fontFamily: `"${value.replace(/[\\"]/g, "\\$&")}"` } : undefined}>{value ?? defaultLabel}</span>
        <ChevronsUpDownIcon className="opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 p-0">
      <Command>
        <CommandInput placeholder={searchPlaceholder} />
        <CommandList>
          <CommandEmpty>{fonts && !fonts.available ? unavailableText : emptyText}</CommandEmpty>
          <CommandGroup>
            <CommandItem value={`\u0000${defaultLabel}`} keywords={[defaultLabel]} onSelect={() => choose(null)}>
              <CheckIcon className={cn(value === null ? "opacity-100" : "opacity-0")} />{defaultLabel}
            </CommandItem>
          </CommandGroup>
          {families.length > 0 && <>
            <CommandSeparator />
            <CommandGroup>
              {families.map(family => <CommandItem key={family} value={family} onSelect={() => choose(family)}>
                <CheckIcon className={cn(value === family ? "opacity-100" : "opacity-0")} />
                <span className="truncate" style={{ fontFamily: `"${family.replace(/[\\"]/g, "\\$&")}"` }}>{family}</span>
              </CommandItem>)}
            </CommandGroup>
          </>}
          {fonts && !fonts.available && <p className="px-3 py-2 text-xs text-muted-foreground">{unavailableText}</p>}
        </CommandList>
        {monospaceOnly && showAllLabel && <label className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          {showAllLabel}<Switch size="sm" checked={showAll} onCheckedChange={setShowAll} />
        </label>}
      </Command>
    </PopoverContent>
  </Popover>
}
