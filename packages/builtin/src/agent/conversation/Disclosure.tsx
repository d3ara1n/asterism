import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@asterism-app/ui/utils";
import { Button } from "@asterism-app/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { NoticeRipple } from "./NoticeRipple";

/** Forming blocks are still receiving input or waiting to run; interrupted blocks ended without completing or entering later context. */
export type BlockState = "forming" | "interrupted" | "failed";

/** Draws the state line along the block's rounded outline; ordinary blocks have no line. */
export function BlockStateLine({ state }: { state: BlockState }) {
  return <svg aria-hidden="true" data-state={state} className="block-state">
    <rect />
  </svg>;
}

/** Shell state for a block: failure outranks forming, which outranks an interrupted outline. */
export function blockState({ pending = false, dashed = false, failed = false }: { pending?: boolean; dashed?: boolean; failed?: boolean }): BlockState | null {
  return failed ? "failed" : pending ? "forming" : dashed ? "interrupted" : null;
}

/**
 * Shared shell for thinking, tools, and summaries: a tone block without a border, where lines appear only for state and focus.
 * The caller owns state, and outer padding does not shrink the clickable title area.
 */
export function Disclosure({ header, children, open, onOpenChange, expandable = true, pending = false, dashed = false, failed = false, noticeAt }: {
  header: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  expandable?: boolean;
  pending?: boolean;
  dashed?: boolean;
  failed?: boolean;
  noticeAt?: number;
}) {
  const state = blockState({ pending, dashed, failed });
  return <Collapsible open={open && expandable} onOpenChange={onOpenChange} asChild>
    {/* Radix owns data-state on the collapsible root; the failure tone uses its own attribute. */}
    <div data-tone={state === "failed" ? "failed" : undefined}
      className={cn("surface-block block text-sm", expandable && "has-[>button:hover]:bg-accent/60")}>
      {state && <BlockStateLine state={state} />}
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
