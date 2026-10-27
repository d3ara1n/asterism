import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { cn } from "../utils"
import { Button } from "./button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "./command"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Switch } from "./switch"

/** Local Font Access API (Chromium); not yet included in the TS standard library. */
type LocalFont = { family: string }
declare global { interface Window { queryLocalFonts?: () => Promise<LocalFont[]> } }

type FontList = { families: string[]; available: boolean }
let cache: Promise<FontList> | null = null

/** Enumerate local font families, deduplicated and sorted by name; return an empty list when unavailable or denied. Query only once per process. */
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
/** Treat a font as monospace when narrow and wide characters have equal width; uninstalled fonts use a fallback, so the result reflects that fallback. */
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
  /** null means the system default. */
  value: string | null
  onValueChange: (value: string | null) => void
  /** Lists only monospace fonts by default; can switch to showing all fonts. */
  monospaceOnly?: boolean
  defaultLabel: string
  searchPlaceholder: string
  emptyText: string
  unavailableText: string
  showAllLabel?: string
  "aria-label"?: string
  className?: string
}

/** Local font selection: a searchable dropdown with each item rendered in its own font; the first item is the system default. */
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
