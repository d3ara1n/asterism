import { type AnyToolRenderProps, useI18n, useRendererResources, useRendererViewState } from "@asterism-app/sdk/renderer";
import { useId, useMemo, type ReactNode } from "react";

import { TooltipHint } from "./tooltip-hint";
import { toolsMessages } from "./messages/tools";
import { JsonView } from "./json-view";
import { characterCount, formatCount } from "./format-count";
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
function ToolDetailsCount({ text }: { text: string | readonly string[] }) {
  const count = useMemo(() => characterCount(text), [text]);
  return <span className="text-muted-foreground tabular-nums">{formatCount(count)}</span>;
}

/** The selected panel owns scrolling. Text supplies its count and the default view; a custom render may add presentation. */
export function ToolDetailsSwitcher({ items, stateKey = null }: {
  items: readonly { value: string; label: string; text: string | readonly string[]; render?(): ReactNode }[]; stateKey?: string | null;
}) {
  const [value, setValue] = useRendererViewState(stateKey, "");
  const panelId = useId();
  const selected = items.find(item => item.value === value);
  return <div className="space-y-2">
    <ToggleGroup type="single" variant="segmented" size="sm" value={selected?.value ?? ""} onValueChange={setValue}
      aria-label={items.map(item => item.label).join(", ")}>
      {items.map(item => <ToggleGroupItem key={item.value} value={item.value} id={`${panelId}-${item.value}`}
        aria-controls={panelId} aria-expanded={selected === item}>{item.label}
        <ToolDetailsCount text={item.text} />
      </ToggleGroupItem>)}
    </ToggleGroup>
    {selected && <ToolScrollArea key={selected.value} className="max-h-80" viewportProps={{ id: panelId, role: "region", "aria-labelledby": `${panelId}-${selected.value}` }}>
      {selected.render ? selected.render() : typeof selected.text === "string" ? <JsonView value={selected.text} scrollable={false} />
        : <div className="flex flex-col gap-2">{selected.text.map((text, index) => <JsonView key={index} value={text} scrollable={false} />)}</div>}
    </ToolScrollArea>}
  </div>;
}
function resourceSubject(icon: ReactNode, title: string): ReactNode {
  return <TooltipHint content={title}><span className="inline-flex max-w-full items-center gap-1 align-middle [&_svg]:size-3 [&_svg]:shrink-0">
    {icon}<span className="truncate">{title}</span>
  </span></TooltipHint>;
}

/** Resource identity comes from the call; only its static kind icon comes from the current renderer catalog. */
export function useToolResourceSubject(resource: AnyToolRenderProps["invocation"]["resource"]): ReactNode {
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

export function DefaultToolHeader({ props, label }: { props: Pick<AnyToolRenderProps, "name" | "invocation">; label?: import("@asterism-app/sdk/contracts").UiText }) {
  const i18n = useI18n();
  return <ToolHeader label={label === undefined ? props.name : i18n.text(label)} subject={useToolResourceSubject(props.invocation.resource)} />;
}
/** Progress and settled outcomes can both carry valid data; their explanations belong outside the body. */
export function DefaultToolBody({ result }: Pick<AnyToolRenderProps, "result">) {
  const i18n = useI18n();
  if (result?.data != null) return <JsonView value={result.data} />;
  if (result && result.kind !== "succeeded" && result.kind !== "partial") return null;
  return <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoOutput)}</p>;
}
