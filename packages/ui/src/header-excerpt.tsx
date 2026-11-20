import { useMemo } from "react";
import type { HeaderExcerptProps } from "@asterism-app/sdk/renderer";
import { headerExcerptText } from "./header-excerpt-text";
import { cn } from "./utils";

/** A bounded, single-line excerpt for a shrinkable title slot. The surrounding header owns emphasis. */
export function HeaderExcerpt({ text, font = "inherit" }: HeaderExcerptProps) {
  const excerpt = useMemo(() => headerExcerptText(text), [text]);
  return excerpt ? <span className={cn("block min-w-0 truncate", font === "mono" && "font-mono")}>{excerpt}</span> : null;
}
