import type { ToolRenderProps } from "@atelier/sdk/renderer";
import type { ReactNode } from "react";

import { toolsMessages } from "../messages/tools";
import { useI18n } from "./i18n";
import { JsonView } from "./json-view";
import { ToolHeader } from "./tool-header";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";

export function ToolDetails({ label, children }: { label: string; children: ReactNode }) {
  return <Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" size="xs">{label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
  </Collapsible>;
}
export function DefaultToolHeader({ props, label }: { props: ToolRenderProps; label?: import("@atelier/sdk/contracts").UiText }) {
  const i18n = useI18n();
  return <ToolHeader label={label === undefined ? props.name : i18n.text(label)} subject={props.invocation.resource?.title} />;
}
export function DefaultToolBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  return result?.data !== null && result?.data !== undefined ? <JsonView value={result.data} /> : <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoOutput)}</p>;
}
