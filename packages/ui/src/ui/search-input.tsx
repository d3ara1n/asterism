import { Search } from "lucide-react";
import { cn } from "../utils";
import { Input } from "./input";

/**
 * Shared composition for search input; the official Input supplies the control appearance.
 * `inline` is for a filter bar embedded flush with the panel top: no border or background, with its icon aligned to the card title icon column (12px left inset),
 * focus feedback uses icon color, and the outer container supplies the separator.
 */
export function SearchInput({ value, onChange, label, variant = "default" }: {
  value: string; onChange: (value: string) => void; label: string; variant?: "default" | "inline";
}) {
  const inline = variant === "inline";
  return <div className="group/search relative">
    <Search className={cn("pointer-events-none absolute size-4 text-muted-foreground",
      inline ? "top-1/2 left-3 -translate-y-1/2 group-focus-within/search:text-foreground" : "top-2.5 left-3")} aria-hidden="true" />
    <Input type="search" value={value} onChange={event => onChange(event.target.value)} aria-label={label} placeholder={label}
      className={cn("pl-9", inline && "h-8 rounded-none border-0 bg-transparent pr-3 shadow-none focus-visible:ring-0 dark:bg-transparent")} />
  </div>;
}
