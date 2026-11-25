import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@asterism-app/ui/utils";
import { Button } from "@asterism-app/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { NoticeRipple } from "./NoticeRipple";
import type { BlockLine } from "./block-shell";

/** Draws a rounded state line independently from the block's fill. */
export function BlockStateLine({ state, outset }: { state: BlockLine | "incident"; outset?: true }) {
  return <svg aria-hidden="true" data-state={state} data-outset={outset} className="block-state">
    <rect />
  </svg>;
}

/**
 * Shared shell for thinking, tools, and summaries: a tone block without a border, where lines appear only for state and focus.
 * The caller owns state, and outer padding does not shrink the clickable title area.
 */
export function Disclosure({ header, children, open, onOpenChange, expandable = true, line, tone, noticeAt }: {
  header: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  expandable?: boolean;
  line?: BlockLine;
  tone?: "failed";
  noticeAt?: number;
}) {
  return <Collapsible open={open && expandable} onOpenChange={onOpenChange} asChild>
    {/* Radix owns data-state on the collapsible root; the failure tone uses its own attribute. */}
    <div data-tone={tone}
      className={cn("surface-block block text-sm", expandable && !tone && "has-[>button:hover]:bg-accent/60")}>
      {line && <BlockStateLine state={line} />}
      <NoticeRipple at={noticeAt} />
      {expandable ? <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto w-full justify-start rounded-[inherit] whitespace-normal px-3 py-2 hover:bg-transparent dark:hover:bg-transparent">
          {header}
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger> : <div className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium">{header}</div>}
      <CollapsibleContent className="space-y-3 px-3 pt-1 pb-3">{children}</CollapsibleContent>
    </div>
  </Collapsible>;
}
