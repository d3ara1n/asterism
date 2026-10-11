import type { ReactNode } from "react";
import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { JsonView } from "./json-view";
import { ToolHeader } from "./tool-header";
import { t } from "./i18n";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

export function ToolDetails({ label, children }: { label: string; children: ReactNode }) {
  return <Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" size="xs">{label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
  </Collapsible>;
}
export function DefaultToolHeader({ props, label }: { props: ToolRenderProps; label?: string }) {
  return <ToolHeader label={label ?? props.name} subject={props.invocation.resource?.title} />;
}
export function DefaultToolBody({ result }: ToolRenderProps) {
  return result?.data !== null && result?.data !== undefined ? <JsonView value={result.data} /> : <p className="type-caption">{t.toolNoOutput}</p>;
}
