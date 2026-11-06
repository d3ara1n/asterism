import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@asterism-app/ui/utils";
import { Button } from "@asterism-app/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { Item } from "@asterism-app/ui/ui/item";

/** Shared shell for thinking, tools, and summaries; the caller owns state, and outer padding does not shrink the clickable title area. */
export function Disclosure({ header, children, open, onOpenChange, expandable = true, pending = false, dashed = false, failed = false }: {
  header: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  expandable?: boolean;
  pending?: boolean;
  dashed?: boolean;
  failed?: boolean;
}) {
  return <Collapsible open={open && expandable} onOpenChange={onOpenChange} asChild>
    <Item variant="outline" size="sm" className={cn("block p-0", (pending || dashed) && "border-dashed", failed && "border-destructive")}>
      {expandable ? <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal px-3 py-2">
          {header}
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger> : <div className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium">{header}</div>}
      <CollapsibleContent className="space-y-3 p-3">{children}</CollapsibleContent>
    </Item>
  </Collapsible>;
}
