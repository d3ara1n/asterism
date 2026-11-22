"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "../utils"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { toggleVariants } from "./toggle"

// Local change: the segmented variant draws a track with one indicator that travels to the selected item.
type ToggleGroupVariant = VariantProps<typeof toggleVariants>["variant"] | "segmented"

const ToggleGroupContext = React.createContext<
  Omit<VariantProps<typeof toggleVariants>, "variant"> & {
    variant?: ToggleGroupVariant
    spacing?: number
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
})

/** Places the segmented indicator under the selected item; the transition starts after the first placement so it never grows in on mount. */
function useSegmentIndicator(root: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  React.useLayoutEffect(() => {
    const element = root.current
    if (!enabled || !element) return
    const update = () => {
      const on = element.querySelector<HTMLElement>("[data-slot=toggle-group-item][data-state=on]")
      element.style.setProperty("--indicator-opacity", on ? "1" : "0")
      if (!on) return
      element.style.setProperty("--indicator-x", `${on.offsetLeft}px`)
      element.style.setProperty("--indicator-width", `${on.offsetWidth}px`)
    }
    update()
    const frame = requestAnimationFrame(() => { element.dataset.indicatorReady = "true" })
    const resize = new ResizeObserver(update)
    resize.observe(element)
    for (const item of element.querySelectorAll("[data-slot=toggle-group-item]")) resize.observe(item)
    const mutation = new MutationObserver(update)
    mutation.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect() }
  }, [root, enabled])
}

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  Omit<VariantProps<typeof toggleVariants>, "variant"> & {
    variant?: ToggleGroupVariant
    spacing?: number
  }) {
  const segmented = variant === "segmented"
  const gap = segmented ? 0.5 : spacing
  const root = React.useRef<HTMLDivElement>(null)
  useSegmentIndicator(root, segmented)
  return (
    <ToggleGroupPrimitive.Root
      ref={root}
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={gap}
      style={{ "--gap": gap } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs",
        segmented && "relative isolate bg-muted p-0.5",
        className
      )}
      {...props}
    >
      {segmented && <span aria-hidden="true" data-slot="toggle-group-indicator"
        className="pointer-events-none absolute inset-y-0.5 left-0 -z-10 rounded-sm bg-background shadow-xs group-data-[indicator-ready=true]/toggle-group:transition-[translate,width,opacity] group-data-[indicator-ready=true]/toggle-group:duration-250 group-data-[indicator-ready=true]/toggle-group:ease-(--ease-out)"
        style={{ translate: "var(--indicator-x, 0) 0", width: "var(--indicator-width, 0)", opacity: "var(--indicator-opacity, 0)" }} />}
      <ToggleGroupContext.Provider value={{ variant, size, spacing: gap }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)
  const segmented = context.variant === "segmented"
  const resolvedSize = context.size || size

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={resolvedSize}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant === "segmented" ? "default" : context.variant || variant,
          size: resolvedSize,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
        segmented && "rounded-sm px-2.5 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground",
        segmented && (resolvedSize === "sm" ? "h-7 min-w-7" : resolvedSize === "lg" ? "h-9 min-w-9" : "h-8 min-w-8"),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
