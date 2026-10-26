import { type ToolRenderProps, useI18n, useRendererViewState } from "@asterism/sdk/renderer";
import { useId, type ReactNode } from "react";

import { toolsMessages } from "./messages/tools";
import { JsonView } from "./json-view";
import { ToolHeader } from "./tool-header";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/** stateKey 在所在条目内唯一时，展开状态随条目重新挂载保留；省略时只作组件状态。 */
export function ToolDetails({ label, stateKey = null, children }: { label: string; stateKey?: string | null; children: ReactNode }) {
  const [open, setOpen] = useRendererViewState(stateKey, false);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild><Button variant="ghost" size="xs">{label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
  </Collapsible>;
}
export function ToolDetailsSwitcher({ items, stateKey = null }: {
  items: readonly { value: string; label: string; render(): ReactNode }[]; stateKey?: string | null;
}) {
  const [value, setValue] = useRendererViewState(stateKey, "");
  const panelId = useId();
  const selected = items.find(item => item.value === value);
  return <div className="space-y-2">
    <ToggleGroup type="single" size="sm" value={selected?.value ?? ""} onValueChange={setValue}
      aria-label={items.map(item => item.label).join(", ")}>
      {items.map(item => <ToggleGroupItem key={item.value} value={item.value} id={`${panelId}-${item.value}`}
        aria-controls={panelId} aria-expanded={selected === item}>{item.label}</ToggleGroupItem>)}
    </ToggleGroup>
    {selected && <div id={panelId} role="region" aria-labelledby={`${panelId}-${selected.value}`}>{selected.render()}</div>}
  </div>;
}
export function DefaultToolHeader({ props, label }: { props: ToolRenderProps; label?: import("@asterism/sdk/contracts").UiText }) {
  const i18n = useI18n();
  return <ToolHeader label={label === undefined ? props.name : i18n.text(label)} subject={props.invocation.resource?.title} />;
}
export function DefaultToolBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  return result?.data !== null && result?.data !== undefined ? <JsonView value={result.data} /> : <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoOutput)}</p>;
}
