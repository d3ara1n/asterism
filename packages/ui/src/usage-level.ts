import type { UsageLevel } from "@asterism-app/sdk/contracts";

/** Static class names keep every tone visible to the Tailwind scanner. Red is reserved for exhausted: no request can succeed. */
export const usageLevelTones: Record<UsageLevel, { dot: string; text: string; track: string; bar: string }> = {
  available: { dot: "bg-success", text: "text-success", track: "bg-success/25", bar: "[&>[data-slot=progress-indicator]]:bg-success" },
  low: { dot: "bg-warning", text: "text-warning", track: "bg-warning/25", bar: "[&>[data-slot=progress-indicator]]:bg-warning" },
  exhausted: { dot: "bg-destructive", text: "text-destructive", track: "bg-destructive/25", bar: "[&>[data-slot=progress-indicator]]:bg-destructive" },
};
/** No reported items yet: waiting for headers, loading, or failed without an earlier result. */
export const unknownUsageDot = "bg-muted-foreground/40";
