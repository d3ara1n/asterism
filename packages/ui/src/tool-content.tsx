import { type ToolRenderProps, useI18n, useRendererResources, useRendererViewState } from "@asterism-app/sdk/renderer";
import { useId, type ReactNode } from "react";

import { TooltipHint } from "./tooltip-hint";
import { toolsMessages } from "./messages/tools";
import { JsonView } from "./json-view";
import { formatCount } from "./format-count";
import { ToolHeader } from "./tool-header";
import { ToolScrollArea } from "./tool-scroll-area";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export { ToolScrollArea } from "./tool-scroll-area";

/** When stateKey is unique within the containing item, expansion state survives item remounts; when omitted, it is only component state. */
export function ToolDetails({ label, stateKey = null, children }: { label: string; stateKey?: string | null; children: ReactNode }) {
  const [open, setOpen] = useRendererViewState(stateKey, false);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild><Button variant="ghost" size="xs">{label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
  </Collapsible>;
}
/** The selected panel owns scrolling; its blocks render without independent vertical scroll areas. */
export function ToolDetailsSwitcher({ items, stateKey = null }: {
  items: readonly { value: string; label: string; characterCount?: number; render(): ReactNode }[]; stateKey?: string | null;
}) {
  const [value, setValue] = useRendererViewState(stateKey, "");
  const panelId = useId();
  const selected = items.find(item => item.value === value);
  return <div className="space-y-2">
    <ToggleGroup type="single" size="sm" value={selected?.value ?? ""} onValueChange={setValue}
      aria-label={items.map(item => item.label).join(", ")}>
      {items.map(item => <ToggleGroupItem key={item.value} value={item.value} id={`${panelId}-${item.value}`}
        aria-controls={panelId} aria-expanded={selected === item}>{item.label}
        {item.characterCount !== undefined && <span className="text-muted-foreground tabular-nums">{formatCount(item.characterCount)}</span>}
      </ToggleGroupItem>)}
    </ToggleGroup>
    {selected && <ToolScrollArea key={selected.value} className="max-h-80" viewportProps={{ id: panelId, role: "region", "aria-labelledby": `${panelId}-${selected.value}` }}>
      {selected.render()}
    </ToolScrollArea>}
  </div>;
}
function resourceSubject(icon: ReactNode, title: string): ReactNode {
  return <TooltipHint content={title}><span className="inline-flex max-w-full items-center gap-1 align-middle [&_svg]:size-3 [&_svg]:shrink-0">
    {icon}<span className="truncate">{title}</span>
  </span></TooltipHint>;
}

/** Resource identity comes from the call; only its static kind icon comes from the current renderer catalog. */
export function useToolResourceSubject(resource: ToolRenderProps["invocation"]["resource"]): ReactNode {
  const resources = useRendererResources();
  return resource && resourceSubject(resources.get(resource.kind).icon, resource.title);
}

/** Type-oriented operations use the registered kind label instead of an instance name. */
export function useToolResourceTypeSubject(kind: string | undefined): ReactNode {
  const resources = useRendererResources();
  const i18n = useI18n();
  const description = kind ? resources.get(kind) : undefined;
  return description && resourceSubject(description.icon, i18n.text(description.label));
}

export function DefaultToolHeader({ props, label }: { props: ToolRenderProps; label?: import("@asterism-app/sdk/contracts").UiText }) {
  const i18n = useI18n();
  return <ToolHeader label={label === undefined ? props.name : i18n.text(label)} subject={useToolResourceSubject(props.invocation.resource)} />;
}
export function DefaultToolBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  return result?.data !== null && result?.data !== undefined ? <JsonView value={result.data} /> : <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoOutput)}</p>;
}
