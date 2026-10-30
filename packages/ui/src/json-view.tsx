import { cn } from "./utils";

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return <pre className={cn("min-w-0 max-w-full max-h-80 overflow-auto whitespace-pre-wrap wrap-anywhere font-mono text-xs leading-relaxed", className)}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}
