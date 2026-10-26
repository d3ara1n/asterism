import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@asterism/ui/utils";
import { Button } from "@asterism/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism/ui/ui/collapsible";
import { Item } from "@asterism/ui/ui/item";

/** 思考、工具与摘要共用外壳；调用方拥有状态，标题点击区不受外层内边距挤压。 */
export function Disclosure({ header, children, open, onOpenChange, expandable = true, pending = false }: {
  header: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  expandable?: boolean;
  pending?: boolean;
}) {
  return <Collapsible open={open && expandable} onOpenChange={onOpenChange} asChild>
    <Item variant="outline" size="sm" className={cn("block p-0", pending && "border-dashed")}>
      {expandable ? <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal px-3 py-2">
          {header}
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger> : <div className="flex items-center gap-2 px-3 py-2 type-caption">{header}</div>}
      <CollapsibleContent className="space-y-3 p-3">{children}</CollapsibleContent>
    </Item>
  </Collapsible>;
}
