import { Boxes, Check, ChevronRight, Minus, MousePointerClick, ScanSearch, TriangleAlert, Wrench } from "lucide-react";
import { previewArguments } from "../../../shared/partial-arguments";
import type { ReactNode } from "react";
import type { z } from "zod";
import type { Json, UiText } from "@asterism-app/sdk/contracts";
import { toolRenderer, useRendererResources, useRendererViewState, type ToolRenderProps, type ToolRenderer, type ToolView } from "@asterism-app/sdk/renderer";

import { ResourceCall, ResourceInspect, ResourceInspectResult, ResourceList, ResourceListResult, ResourceScript } from "../../../tools/core";
import { toolsMessages } from "../../messages/tools";
import { useModuleViews } from "../../modules/views";
import type { ViewRegistry } from "../../modules/registry";
import { getI18n, useI18n } from "../../shared/i18n";
import { useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { cn } from "@asterism-app/ui/utils";
import { scriptToolRenderer } from "./script-view";
import { resourceStateFields, type StateField, type StateValue } from "./resource-state";

type ListProps = ToolRenderProps<z.infer<typeof ResourceListResult.schema>>;
function ResourceListHeader({ result }: ListProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.formatMessage(toolsMessages.toolResourceList)}
    meta={result?.data && i18n.formatMessage(toolsMessages.toolResourceCount, { count: result.data.resources.length })} />;
}
/** One row per resource: identity only, plus the tool restriction that explains why its tools may be unavailable. State stays in the raw result details. */
function ResourceListBody({ result }: ListProps) {
  const i18n = useI18n();
  const registry = useModuleViews();
  if (!result?.data) return null;
  if (!result.data.resources.length) return <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoResources)}</p>;
  const restricted = i18n.formatMessage(toolsMessages.toolResourceRestricted);
  return <TooltipProvider delayDuration={300}><ul className="flex flex-col">
    {result.data.resources.map(resource => {
      const description = registry.resource(resource.type);
      return <li key={resource.resource_id} className="flex h-7 min-w-0 items-center gap-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0">
        {description.icon}
        <span className="min-w-0 truncate" title={resource.title}>{resource.title}</span>
        {resource.notice && <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex shrink-0 rounded-sm text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <TriangleAlert className="size-3.5" aria-label={restricted} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs space-y-1 text-left">
            <p className="font-medium">{restricted}</p>
            <p>{resource.notice}</p>
          </TooltipContent>
        </Tooltip>}
        <span className="ml-auto shrink-0 type-caption text-muted-foreground">{i18n.text(description.label)}</span>
      </li>;
    })}
  </ul></TooltipProvider>;
}
const listView = { headerRenderer: ResourceListHeader, bodyRenderer: ResourceListBody };
const list = toolRenderer(ResourceListResult, {
  label: toolsMessages.toolResourceList, icon: <Boxes className="size-3.5" />,
  input: { headerRenderer: ResourceListHeader }, execution: listView, result: listView,
});

type InspectProps = ToolRenderProps<z.infer<typeof ResourceInspectResult.schema>>;
type InspectedTool = z.infer<typeof ResourceInspectResult.schema>["tools"][number];
/** An explicit empty tools selection requests state only, so the result's empty tool list is not a resource fact. */
function stateOnly(args: Json): boolean {
  return !!args && typeof args === "object" && !Array.isArray(args) && Array.isArray(args.tools) && args.tools.length === 0;
}
function ResourceInspectHeader({ invocation, args, result }: InspectProps) {
  const i18n = useI18n();
  const tools = result?.data?.tools;
  return <ToolHeader label={i18n.formatMessage(toolsMessages.toolResourceInspect)}
    subject={useToolResourceSubject(invocation.resource)}
    meta={tools && !stateOnly(args) && i18n.formatMessage(toolsMessages.toolCount, { count: tools.length })} />;
}

function StateFields({ fields, path }: { fields: readonly StateField[]; path: string }) {
  return <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 type-caption">
    {fields.map(field => {
      const key = `${path}/${field.key}`;
      return field.value.kind === "prose"
        ? <div key={key} className="col-span-2 min-w-0 space-y-0.5">
          {field.label && <dt className="text-muted-foreground" title={field.key}>{field.label}</dt>}
          <dd className="whitespace-pre-wrap break-words">{field.value.value}</dd>
        </div>
        : <div key={key} className="contents">
          <dt className="truncate text-muted-foreground" title={field.key}>{field.label}</dt>
          <dd className="min-w-0"><StateValueView value={field.value} path={key} /></dd>
        </div>;
    })}
  </dl>;
}
function StateValueView({ value, path }: { value: StateValue; path: string }) {
  const i18n = useI18n();
  switch (value.kind) {
    case "empty": return <span className="text-muted-foreground">—</span>;
    case "flag": return value.value
      ? <Check className="inline size-3.5 text-success" aria-label={i18n.formatMessage(toolsMessages.toolStateTrue)} />
      : <Minus className="inline size-3.5 text-muted-foreground" aria-label={i18n.formatMessage(toolsMessages.toolStateFalse)} />;
    case "number": return <span className="tabular-nums">{value.value}</span>;
    case "token": return <span className="font-mono break-all">{value.value}</span>;
    case "text": case "prose": return <span className="whitespace-pre-wrap break-words">{value.value}</span>;
    case "list": return <span className="flex flex-wrap gap-1">
      {value.values.map((item, index) => <Badge key={index} variant="secondary" className="max-w-full font-normal">
        <span className="truncate" title={item}>{item}</span>
      </Badge>)}
    </span>;
    case "group": return <div className="border-l pl-3"><StateFields fields={value.fields} path={path} /></div>;
    case "items": return <StateItems items={value.items} path={path} />;
  }
}
/** Arrays of compound values stay collapsed behind their count; scalar fields remain readable at a glance. */
function StateItems({ items, path }: { items: readonly StateValue[]; path: string }) {
  const i18n = useI18n();
  const [open, setOpen] = useRendererViewState(`asterism/resource-state:${path}`, false);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
      {i18n.formatMessage(toolsMessages.toolStateItems, { count: items.length })}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ul className="space-y-1.5 pt-1.5">{items.map((item, index) => <li key={index} className="rounded-md border px-2 py-1.5">
        {item.kind === "group" ? <StateFields fields={item.fields} path={`${path}/${index}`} /> : <StateValueView value={item} path={`${path}/${index}`} />}
      </li>)}</ul>
    </CollapsibleContent>
  </Collapsible>;
}

/** Tools appear by their registered display names; descriptions and model-facing names move to the tooltip, and contracts stay in the raw result details. */
function ToolChips({ tools }: { tools: readonly InspectedTool[] }) {
  const i18n = useI18n();
  const registry = useModuleViews();
  const interaction = i18n.formatMessage(toolsMessages.toolRequiresInteraction);
  return <TooltipProvider delayDuration={300}><ul className="flex flex-wrap gap-1.5">
    {tools.map(tool => {
      const label = registry.toolLabel(tool.implementation.id);
      return <li key={tool.name} className="min-w-0"><Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className="max-w-full font-normal">
            {registry.toolIcon(tool.implementation.id) ?? <Wrench />}
            <span className="truncate">{label ? i18n.text(label) : tool.name}</span>
            {tool.requiresInteraction && <MousePointerClick className="text-muted-foreground" aria-label={interaction} />}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1 text-left">
          <p className="font-mono">{tool.name}</p>
          {tool.description && <p className="line-clamp-6">{tool.description}</p>}
          {tool.requiresInteraction && <p className="opacity-70">{interaction}</p>}
        </TooltipContent>
      </Tooltip></li>;
    })}
  </ul></TooltipProvider>;
}

function ResourceInspectBody({ invocation, args, result }: InspectProps) {
  const i18n = useI18n();
  if (!result?.data) return null;
  const { state, notice, tools } = result.data;
  const fields = resourceStateFields(state, invocation.resource);
  const showTools = !stateOnly(args);
  return <div className="space-y-4 select-text">
    {fields.length > 0 && <section className="space-y-2">
      <p className="type-label">{i18n.formatMessage(toolsMessages.toolResourceState)}</p>
      <StateFields fields={fields} path="" />
    </section>}
    {notice && <p className="type-caption">{notice}</p>}
    {showTools && <section className="space-y-2">
      <p className="type-label">{i18n.formatMessage(toolsMessages.toolAvailableTools)}</p>
      {tools.length ? <ToolChips tools={tools} /> : <p className="type-caption">{i18n.formatMessage(toolsMessages.toolNoTools)}</p>}
    </section>}
  </div>;
}
const inspectView = { headerRenderer: ResourceInspectHeader, bodyRenderer: ResourceInspectBody };
const inspect = toolRenderer(ResourceInspectResult, {
  label: toolsMessages.toolResourceInspect, icon: <ScanSearch className="size-3.5" />,
  input: { headerRenderer: ResourceInspectHeader }, execution: inspectView, result: inspectView,
});

export interface ResolvedToolView extends ToolView { props: ToolRenderProps }
/** Host entries with fixed names; each renderer carries the entry's label and icon. */
const fixedTools = new Map<string, { preparation: UiText; renderer: ToolRenderer }>([
  [ResourceList.name, { preparation: toolsMessages.toolPreparingList, renderer: list }],
  [ResourceInspect.name, { preparation: toolsMessages.toolPreparingInspect, renderer: inspect }],
  [ResourceScript.name, { preparation: toolsMessages.toolPreparingScript, renderer: scriptToolRenderer }],
]);
function fixed(renderer: ToolRenderer, props: ToolRenderProps): ResolvedToolView {
  const identity = props.invocation.implementation;
  const view = !identity || identity.id === renderer.contract.id ? renderer.resolve(props) : null;
  return { label: renderer.label, icon: renderer.icon, ...view, props };
}
/** The fixed entry's own adapter handles forwarding; the shared shell does not know the resource tool protocol. */
function resourceCall(props: ToolRenderProps, registry: ViewRegistry): ResolvedToolView {
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
}
export function toolPreparation(name: string): string {
  return getI18n().text(fixedTools.get(name)?.preparation ?? toolsMessages.toolPreparing);
}
/** Fixed entries carry their own names; dispatched and plugin tools use the view registered for their implementation. */
export function toolLabel(name: string, implementation: string | null, registry: ViewRegistry): string | null {
  const label = fixedTools.get(name)?.renderer.label ?? (implementation ? registry.toolLabel(implementation) : undefined);
  return label ? getI18n().text(label) : null;
}
export function toolIcon(name: string, implementation: string | null, registry: ViewRegistry): ReactNode {
  return fixedTools.get(name)?.renderer.icon ?? (implementation ? registry.toolIcon(implementation) : undefined) ?? null;
}
export function resolveToolView(props: ToolRenderProps, registry: ViewRegistry): ResolvedToolView {
  if (props.phase === "input" && props.argumentsText !== undefined)
    props = { ...props, args: previewArguments(props.argumentsText) };
  const entry = fixedTools.get(props.name);
  if (entry) return fixed(entry.renderer, props);
  if (props.name === ResourceCall.name) return resourceCall(props, registry);
  return { props, icon: <Wrench className="size-3.5" />, ...registry.tool(props.invocation.implementation, props) };
}
