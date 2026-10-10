import { Boxes, ScanSearch, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { ResourceCall, ResourceInspectResult, ResourceListResult } from "../../../tools/weft";
import type { Json } from "../../../shared/json";
import { contractKey } from "../../../shared/presentation";
import { toolRenderer, type ToolRenderProps, type ToolRenderer, type ToolView, type ViewRegistry } from "../../modules/registry";
import { JsonView, useModuleViews } from "../../modules/views";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../shared/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../../shared/ui/item";

export function ToolDetails({ label, children }: { label: string; children: ReactNode }) {
  return <Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" size="xs">{label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2 pt-2">{children}</CollapsibleContent>
  </Collapsible>;
}

/** 状态字段可能来自任何资源；常规标量直接阅读，复合值保留完整数据。 */
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
const list = toolRenderer(ResourceListResult, {
  label: t.toolResourceList, icon: <Boxes className="size-3.5" />,
  headerRenderer: ({ result }) => <span>{t.toolResourceList}{result?.data && <span className="type-caption"> · {t.toolResourceCount(result.data.resources.length)}</span>}</span>,
  bodyRenderer: function ResourceListBody({ result }) {
    const registry = useModuleViews();
    if (!result?.data) return null;
    return result.data.resources.length ? <ItemGroup>
      {result.data.resources.map(resource => {
        const description = registry.resource(resource.type);
        return <Item key={resource.resource_id} size="sm">
          <ItemMedia>{description.icon}</ItemMedia>
          <ItemContent><ItemTitle className="break-all">{resource.title}</ItemTitle><ItemDescription>{description.label}</ItemDescription></ItemContent>
        </Item>;
      })}
    </ItemGroup> : <p className="type-caption">{t.toolNoResources}</p>;
  },
});
const inspect = toolRenderer(ResourceInspectResult, {
  label: t.toolResourceInspect, icon: <ScanSearch className="size-3.5" />,
  headerRenderer: function InspectHeader({ invocation }) {
    const registry = useModuleViews();
    const resource = invocation.resource;
    return <span className="flex min-w-0 flex-wrap gap-x-2">
      <span>{t.toolResourceInspect}</span>
      {resource && <><span className="type-caption">{registry.resource(resource.kind).label}</span><span className="truncate">{resource.title}</span></>}
    </span>;
  },
  bodyRenderer: ({ result }) => result?.data ? <div className="space-y-4">
    <section className="space-y-2"><p className="type-label">{t.toolResourceState}</p><ResourceFields value={result.data.state} /></section>
    <section className="space-y-2">
      <p className="type-label">{t.toolAvailableTools}</p>
      {!result.data.tools.length && <p className="type-caption">{t.toolNoTools}</p>}
      <ItemGroup>{result.data.tools.map(tool => <Item key={tool.name} size="sm" className="px-0">
        <ItemContent>
          <ItemTitle>{tool.name}</ItemTitle>
          <ItemDescription className="line-clamp-none">{tool.description}</ItemDescription>
          <ToolDetails label={t.toolUsageDetails}>
            {!!tool.guidelines.length && <ul className="list-disc space-y-1 pl-4 type-caption">{tool.guidelines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
            <p className="type-label">{t.toolArguments}</p><JsonView value={tool.args} />
            <p className="type-label">{t.toolTarget}</p><JsonView value={tool.target} />
            <p className="type-label">{t.toolResultSchema}</p><JsonView value={tool.result} />
          </ToolDetails>
        </ItemContent>
      </Item>)}</ItemGroup>
    </section>
  </div> : null,
});

export interface ResolvedToolView extends ToolView { props: ToolRenderProps }
function fixed(renderer: ToolRenderer, props: ToolRenderProps, label: string, icon: ReactNode): ResolvedToolView {
  const identity = props.invocation.implementation;
  const view = !identity || contractKey(identity) === contractKey(renderer.contract) ? renderer.resolve(props) : null;
  return { label, icon, ...view, props };
}
/** 固定入口自己的适配负责转交；公共外壳不认识资源工具协议。 */
const builtinViews = new Map<string, {
  preparation: string;
  render(props: ToolRenderProps, registry: ViewRegistry): ResolvedToolView;
}>([
  ["resource_list", { preparation: t.toolPreparingList, render: props => fixed(list, props, t.toolResourceList, <Boxes className="size-3.5" />) }],
  ["resource_inspect", { preparation: t.toolPreparingInspect, render: props => fixed(inspect, props, t.toolResourceInspect, <ScanSearch className="size-3.5" />) }],
  ["resource_call", { preparation: t.toolPreparing, render(props, registry) {
    const parsed = ResourceCall.argsSchema.safeParse(props.args);
    if (!parsed.success) return { props, label: t.toolResourceCall };
    const inner = { ...props, name: parsed.data.tool, target: parsed.data.target, args: parsed.data.args };
    return { props: inner, ...registry.tool(props.invocation.implementation, inner) };
  } }],
]);
export function toolPreparation(name: string): string {
  return builtinViews.get(name)?.preparation ?? t.toolPreparing;
}
export function resolveToolView(props: ToolRenderProps, registry: ViewRegistry): ResolvedToolView {
  return builtinViews.get(props.name)?.render(props, registry) ?? { props, icon: <Wrench className="size-3.5" /> };
}
export function DefaultToolHeader({ props, label }: { props: ToolRenderProps; label?: string }) {
  return <span className="flex min-w-0 flex-wrap gap-x-2">
    <span>{label ?? props.name}</span>
    {props.invocation.resource && <span className="truncate type-caption">{props.invocation.resource.title}</span>}
  </span>;
}
export function DefaultToolBody({ result }: ToolRenderProps) {
  return result?.data !== null && result?.data !== undefined ? <JsonView value={result.data} /> : <p className="type-caption">{t.toolNoOutput}</p>;
}
