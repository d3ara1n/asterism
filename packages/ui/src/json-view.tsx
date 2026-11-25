import type { Json } from "@asterism-app/sdk/contracts";
import { ToolScrollArea } from "./tool-scroll-area";
import { cn } from "./utils";

/** Text displayed by JsonView, also used by details that count the display text. */
export function jsonViewText(value: Json): string;
export function jsonViewText(value: unknown): string | undefined;
export function jsonViewText(value: unknown): string | undefined {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** Set scrollable=false when a containing reading region owns scrolling for several blocks. */
export function JsonView({ value, className, scrollable = true }: { value: unknown; className?: string; scrollable?: boolean }) {
  const content = <pre className={cn("min-w-0 max-w-full whitespace-pre-wrap wrap-anywhere font-mono text-xs leading-relaxed", className)}>{jsonViewText(value)}</pre>;
  return scrollable ? <ToolScrollArea className="max-h-80">{content}</ToolScrollArea> : content;
}
