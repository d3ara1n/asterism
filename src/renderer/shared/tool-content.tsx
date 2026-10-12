import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { useId, useState, type ReactNode } from "react";

import { toolsMessages } from "../messages/tools";
import { useI18n } from "./i18n";
import { JsonView } from "./json-view";
import { ToolHeader } from "./tool-header";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export function ToolDetails({ label, children }: { label: string; children: ReactNode }) {
  return <Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" size="xs">{label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
  </Collapsible>;
}
export function ToolDetailsSwitcher({ items }: { items: readonly { value: string; label: string; render(): ReactNode }[] }) {
  const [value, setValue] = useState("");
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
export function DefaultToolHeader({ props, label }: { props: ToolRenderProps; label?: import("@atelier/sdk/contracts").UiText }) {
  const i18n = useI18n();
  return <ToolHeader label={label === undefined ? props.name : i18n.text(label)} subject={props.invocation.resource?.title} />;
}
export function DefaultToolBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  return result?.data !== null && result?.data !== undefined ? <JsonView value={result.data} /> : <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoOutput)}</p>;
}
