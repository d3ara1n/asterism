import * as React from "react"
import { Check } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { cn } from "../utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/**
 * 可视选择组：色块与纹理格的公共外观。基于 Radix RadioGroup，键盘方向键切换、单选语义。
 * 业务只传入每项的预览内容，不另写选中/焦点样式。
 */
function SwatchGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="swatch-group" orientation="horizontal" className={cn("flex flex-wrap gap-2", className)} {...props} />
}

/** 圆形色块：选中加 ring 与对勾，悬停显示名称。 */
function ColorSwatch({ value, label, children, className }: { value: string; label: string; children: React.ReactNode; className?: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <RadioGroupPrimitive.Item value={value} aria-label={label} data-slot="color-swatch"
        className={cn("group relative grid size-7 place-items-center overflow-hidden rounded-full border outline-none transition-shadow",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:ring-2 data-[state=checked]:ring-ring data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-card", className)}>
        {children}
        <RadioGroupPrimitive.Indicator className="absolute inset-0 grid place-items-center">
          <Check className="size-3.5 text-white drop-shadow" strokeWidth={3} />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
}

/** 带标题的预览格：上方为预览，下方为名称。 */
function TileSwatch({ value, label, children, className }: { value: string; label: string; children: React.ReactNode; className?: string }) {
  return <RadioGroupPrimitive.Item value={value} data-slot="tile-swatch"
    className={cn("flex w-24 flex-col overflow-hidden rounded-md border bg-card text-left outline-none transition-colors hover:border-ring/60",
      "focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-ring data-[state=checked]:ring-1 data-[state=checked]:ring-ring", className)}>
    <span className="relative block h-14 border-b bg-canvas">{children}</span>
    <span className="px-2 py-1 text-xs">{label}</span>
  </RadioGroupPrimitive.Item>
}

export { SwatchGroup, ColorSwatch, TileSwatch }
