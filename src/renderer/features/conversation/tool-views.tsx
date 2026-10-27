import { Boxes, ScanSearch, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { z } from "zod";
import type { Json, UiText } from "@asterism/sdk/contracts";
import { toolRenderer, type ToolRenderProps, type ToolRenderer, type ToolView } from "@asterism/sdk/renderer";

import { ResourceCall, ResourceInspectResult, ResourceListResult } from "../../../tools/core";
import { toolsMessages } from "../../messages/tools";
import { JsonView, useModuleViews } from "../../modules/views";
import type { ViewRegistry } from "../../modules/registry";
import { getI18n, useI18n } from "../../shared/i18n";
import { ToolDetails } from "@asterism/ui/tool-content";
import { ToolHeader } from "@asterism/ui/tool-header";
import { ItemGroup, Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "@asterism/ui/ui/item";

/** State fields can come from any resource; ordinary scalars are read directly, while compound values retain complete data. */
function ResourceFields({ value }: { value: Json }) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return <JsonView value={value} />;
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 type-caption">
    {Object.entries(value).map(([key, field]) => <Field key={key} name={key} value={field} />)}
  </dl>;
}
function Field({ name, value }: { name: string; value: Json }) {
  return <><dt className="break-all">{name}</dt><dd className="min-w-0 whitespace-pre-wrap break-words">
    {value !== null && typeof value === "object" ? <JsonView value={value} /> : String(value ?? "—")}
  </dd></>;
}

type ListProps = ToolRenderProps<z.infer<typeof ResourceListResult.schema>>;
function ResourceListHeader({ result }: ListProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.formatMessage(toolsMessages.toolResourceList)}
    meta={result?.data && i18n.formatMessage(toolsMessages.toolResourceCount, { count: result.data.resources.length })} />;
}
function ResourceListBody({ result }: ListProps) {
  const i18n = useI18n();
  const registry = useModuleViews();
  if (!result?.data) return null;
  return result.data.resources.length ? <ItemGroup>
    {result.data.resources.map(resource => {
      const description = registry.resource(resource.type);
      return <Item key={resource.resource_id} size="sm">
        <ItemMedia>{description.icon}</ItemMedia>
        <ItemContent><ItemTitle className="break-all">{resource.title}</ItemTitle><ItemDescription>{i18n.text(description.label)}</ItemDescription></ItemContent>
      </Item>;
    })}
  </ItemGroup> : <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoResources)}</p>;
}
const listView = { headerRenderer: ResourceListHeader, bodyRenderer: ResourceListBody };
const list = toolRenderer(ResourceListResult, {
  label: toolsMessages.toolResourceList, icon: <Boxes className="size-3.5" />,
  input: { headerRenderer: ResourceListHeader }, execution: listView, result: listView,
});

type InspectProps = ToolRenderProps<z.infer<typeof ResourceInspectResult.schema>>;
function ResourceInspectHeader({ invocation }: InspectProps) {
  const i18n = useI18n();
  const registry = useModuleViews();
  const resource = invocation.resource;
  return <ToolHeader label={i18n.formatMessage(toolsMessages.toolResourceInspect)} subject={resource?.title}
    meta={resource && i18n.text(registry.resource(resource.kind).label)} />;
}
function ResourceInspectBody({ result }: InspectProps) {
  const i18n = useI18n();
  return result?.data ? <div className="space-y-4">
    <section className="space-y-2"><p className="type-label">{i18n.formatMessage(toolsMessages.toolResourceState)}</p><ResourceFields value={result.data.state} /></section>
    <section className="space-y-2">
      <p className="type-label">{i18n.formatMessage(toolsMessages.toolAvailableTools)}</p>
      {!result.data.tools.length && <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoTools)}</p>}
      <ItemGroup>{result.data.tools.map(tool => <Item key={tool.name} size="sm" className="px-0">
        <ItemContent>
          <ItemTitle>{tool.name}</ItemTitle>
          <ItemDescription className="line-clamp-none">{tool.description}</ItemDescription>
          <ToolDetails label={i18n.formatMessage(toolsMessages.toolUsageDetails)} stateKey={`asterism/tool-usage:${tool.name}`}>
            {!!tool.guidelines.length && <ul className="list-disc space-y-1 pl-4 type-caption">{tool.guidelines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
            <p className="type-label">{i18n.formatMessage(toolsMessages.toolArguments)}</p><JsonView value={tool.args} />
            <p className="type-label">{i18n.formatMessage(toolsMessages.toolTarget)}</p><JsonView value={tool.target} />
            <p className="type-label">{i18n.formatMessage(toolsMessages.toolResultSchema)}</p><JsonView value={tool.result} />
          </ToolDetails>
        </ItemContent>
      </Item>)}</ItemGroup>
    </section>
  </div> : null;
}
const inspectView = { headerRenderer: ResourceInspectHeader, bodyRenderer: ResourceInspectBody };
const inspect = toolRenderer(ResourceInspectResult, {
  label: toolsMessages.toolResourceInspect, icon: <ScanSearch className="size-3.5" />,
  input: { headerRenderer: ResourceInspectHeader }, execution: inspectView, result: inspectView,
});

export interface ResolvedToolView extends ToolView { props: ToolRenderProps }
function fixed(renderer: ToolRenderer, props: ToolRenderProps, label: UiText, icon: ReactNode): ResolvedToolView {
  const identity = props.invocation.implementation;
  const view = !identity || identity.id === renderer.contract.id ? renderer.resolve(props) : null;
  return { label, icon, ...view, props };
}
/** The fixed entry's own adapter handles forwarding; the shared shell does not know the resource tool protocol. */
const builtinViews = new Map<string, {
  preparation: UiText;
  render(props: ToolRenderProps, registry: ViewRegistry): ResolvedToolView;
}>([
  ["resource_list", { preparation: toolsMessages.toolPreparingList, render: props => fixed(list, props, toolsMessages.toolResourceList, <Boxes className="size-3.5" />) }],
  ["resource_inspect", { preparation: toolsMessages.toolPreparingInspect, render: props => fixed(inspect, props, toolsMessages.toolResourceInspect, <ScanSearch className="size-3.5" />) }],
  ["resource_call", { preparation: toolsMessages.toolPreparing, render(props, registry) {
    if (props.phase === "input") {
      const args = props.args;
      if (!args || typeof args !== "object" || Array.isArray(args) || typeof args.tool !== "string") return { props };
      const inner = { ...props, name: args.tool, target: args.target ?? null, args: args.args ?? null };
      return { props: inner, ...registry.tool(props.invocation.implementation, inner) };
    }
    const parsed = ResourceCall.argsSchema.safeParse(props.args);
    if (!parsed.success) return { props, label: toolsMessages.toolResourceCall };
    const inner = { ...props, name: parsed.data.tool, target: parsed.data.target, args: parsed.data.args };
    return { props: inner, ...registry.tool(props.invocation.implementation, inner) };
  } }],
]);
export function toolPreparation(name: string): string {
  return getI18n().text(builtinViews.get(name)?.preparation ?? toolsMessages.toolPreparing);
}
export function resolveToolView(props: ToolRenderProps, registry: ViewRegistry): ResolvedToolView {
  return builtinViews.get(props.name)?.render(props, registry)
    ?? { props, icon: <Wrench className="size-3.5" />, ...registry.tool(props.invocation.implementation, props) };
}
