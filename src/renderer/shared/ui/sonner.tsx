import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { cn } from "@asterism-app/ui/utils"

import { useScheme } from "../../features/appearance/state"

/**
 * Official shadcn sonner source; the only changes: derive the theme from resolved appearance (useScheme) without introducing next-themes,
 * color status icons using success / warning / destructive tokens, and top-align the icon with the title line.
 * Sonner centers the icon against the whole content, which drifts away from the title once a description wraps;
 * the 2px offset centers the 16px icon on the 13px/1.5 title line.
 */
const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const scheme = useScheme()

  return (
    <Sonner
      theme={scheme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
      toastOptions={{
        ...toastOptions,
        classNames: { ...toastOptions?.classNames, toast: cn("items-start!", toastOptions?.classNames?.toast), icon: cn("mt-0.5", toastOptions?.classNames?.icon) },
      }}
    />
  )
}

export { Toaster }
