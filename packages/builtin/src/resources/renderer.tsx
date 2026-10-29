import type { ReactNode } from "react";
import type { z } from "zod";
import { ListPlus, ScanSearch, CirclePlus, CircleMinus, Users, Bot, MessageSquareText, PenLine } from "lucide-react";
import { toolRenderer, useI18n, useRendererResources, type RendererModule, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { JsonView } from "@asterism-app/ui/json-view";
import { ToolDetails } from "@asterism-app/ui/tool-content";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { ItemGroup, Item, ItemContent, ItemTitle, ItemDescription, ItemMedia } from "@asterism-app/ui/ui/item";
import { Separator } from "@asterism-app/ui/ui/separator";
import { Badge } from "@asterism-app/ui/ui/badge";
import { resourceMessages as messages } from "../messages/resources";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { AgentListResult, CreationListResult, CreationInspectResult, ResourceCreateResult, ResourceRemoveResult, ResourceRenameResult } from "./contract";
import { useCreationDirectory, prepareCreationDirectory } from "./directory";

function ResourceType({ kind }: { kind: string }) {
  const resource = useRendererResources().get(kind);
  const label = useI18n().text(resource.label);
  return <Badge variant="secondary" className="max-w-full py-0 type-caption font-normal" title={label}>
    {resource.icon}<span className="truncate">{label}</span>
  </Badge>;
}

/** Results retain the type from that call; the current entry-point catalog only supplements calls that have not finished. */
function CreationHeader({ label, creationId, kind, title }: {
  label: string; creationId?: string; kind?: string; title?: string;
}) {
  const directory = useCreationDirectory();
  const i18n = useI18n();
  const resourceKind = kind ?? (creationId ? directory.kinds.get(creationId) : undefined);
  return <ToolHeader label={label} badge={resourceKind && <ResourceType kind={resourceKind} />}
    subject={title} meta={creationId && !resourceKind && directory.failed ? i18n.text(messages.directoryUnavailable) : undefined} />;
}

function Field({ label, children, monospace = true }: { label: string; children: ReactNode; monospace?: boolean }) {
  return <div className="space-y-1">
    <dt className="type-caption text-muted-foreground">{label}</dt>
    <dd className={monospace ? "type-caption break-all font-mono" : "type-caption"}>{children}</dd>
  </div>;
}

type ListProps = ToolRenderProps<z.infer<typeof CreationListResult.schema>>;
type AgentListProps = ToolRenderProps<z.infer<typeof AgentListResult.schema>>;
function AgentListHeader({ result }: AgentListProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.agents)}
    meta={result?.data && i18n.formatMessage(messages.agentCount, { count: result.data.length })} />;
}
function AgentListBody({ result }: AgentListProps) {
  const i18n = useI18n();
  const entries = result?.data;
  if (!entries) return null;
  if (!entries.length) return <p className="type-caption">{i18n.text(messages.noAgents)}</p>;
  return <div className="@container/agents space-y-3">
    <ItemGroup className="grid grid-cols-1 items-stretch gap-3 @min-[36rem]/agents:grid-cols-2">
      {entries.slice(0, TOOL_BODY_LINE_LIMIT).map(entry => <Item key={entry.id} role="listitem"
        variant="outline" size="sm" className="min-w-0 flex-col items-stretch gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ItemMedia variant="icon" className="text-muted-foreground"><Bot aria-hidden="true" /></ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full break-words">{entry.id}</ItemTitle>
          </ItemContent>
        </div>
        {entry.description && <p className="type-caption whitespace-pre-wrap break-words text-pretty text-muted-foreground">
          {entry.description}
        </p>}
        {!!entry.examples.length && <div className="mt-auto space-y-2">
          <Separator />
          <p className="flex items-center gap-1.5 type-label text-muted-foreground">
            <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
            {i18n.text(messages.examples)}
          </p>
          <ul className="space-y-2 pl-4 type-caption list-disc marker:text-muted-foreground">
            {entry.examples.map((example, index) => <li key={index}
              className="whitespace-pre-wrap break-words text-pretty">{example}</li>)}
          </ul>
        </div>}
      </Item>)}
    </ItemGroup>
    {entries.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(messages.omitted, { count: entries.length - TOOL_BODY_LINE_LIMIT })}
    </p>}
  </div>;
}
function ListHeader({ result }: ListProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.list)}
    meta={result?.data && i18n.formatMessage(messages.count, { count: result.data.length })} />;
}
function ListBody({ result }: ListProps) {
  const i18n = useI18n();
  const entries = result?.data;
  if (!entries) return null;
  if (!entries.length) return <p className="type-caption">{i18n.text(messages.empty)}</p>;
  return <div className="space-y-2">
    <ItemGroup>{entries.slice(0, TOOL_BODY_LINE_LIMIT).map(entry => <Item key={entry.id} size="sm" className="px-0">
      <ItemContent>
        <ItemTitle><ResourceType kind={entry.resourceKind} /></ItemTitle>
        <ItemDescription className="line-clamp-none whitespace-pre-wrap">{entry.description}</ItemDescription>
      </ItemContent>
    </Item>)}</ItemGroup>
    {entries.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(messages.omitted, { count: entries.length - TOOL_BODY_LINE_LIMIT })}
    </p>}
  </div>;
}

type InspectProps = ToolRenderProps<z.infer<typeof CreationInspectResult.schema>>;
function InspectHeader({ args, phase, result }: InspectProps) {
  const i18n = useI18n();
  return <CreationHeader label={i18n.text(messages.inspect)}
    creationId={phase === "settled" ? undefined : inputText(args, "creation_id")} kind={result?.data?.resourceKind} />;
}
function InspectBody({ result }: InspectProps) {
  const i18n = useI18n();
  const entry = result?.data;
  if (!entry) return null;
  return <div className="space-y-3">
    <p className="type-caption whitespace-pre-wrap break-words">{entry.description}</p>
    {!!entry.guidelines.length && <section className="space-y-2">
      <p className="type-label">{i18n.text(messages.guidelines)}</p>
      <ul className="list-disc space-y-1 pl-4 type-caption whitespace-pre-wrap break-words">
        {entry.guidelines.map((line, index) => <li key={index}>{line}</li>)}
      </ul>
    </section>}
    <ToolDetails label={i18n.text(messages.inputSchema)} stateKey="asterism.builtin/inspect-schema"><JsonView value={entry.input} /></ToolDetails>
  </div>;
}

type CreateProps = ToolRenderProps<z.infer<typeof ResourceCreateResult.schema>>;
function CreateHeader({ args, phase, result }: CreateProps) {
  const i18n = useI18n();
  const created = phase === "settled" && result.kind === "succeeded" && result.data && "title" in result.data
    ? result.data : null;
  return <CreationHeader label={i18n.text(messages.create)} creationId={phase === "settled" ? undefined : inputText(args, "creation_id")}
    kind={result?.data?.type} title={created?.title} />;
}
function CreateBody({ result }: CreateProps) {
  const i18n = useI18n();
  const resource = result?.data;
  if (!resource) return null;
  return <dl className="space-y-2">
    {"resource_id" in resource && <Field label={i18n.text(messages.resourceId)}>{resource.resource_id}</Field>}
    <Field label={i18n.text(messages.kind)} monospace={false}><ResourceType kind={resource.type} /></Field>
  </dl>;
}

type RemoveProps = ToolRenderProps<z.infer<typeof ResourceRemoveResult.schema>>;
function RemoveHeader({ args, result }: RemoveProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.remove)} monospace
    subject={result?.data?.resource_id ?? inputText(args, "resource_id")} />;
}
function RemoveBody({ result }: RemoveProps) {
  const i18n = useI18n();
  const resource = result?.data;
  if (!resource) return null;
  return <div className="space-y-3">
    {result.kind === "succeeded" && <p className="type-caption">{i18n.text(messages.removed)}</p>}
    <dl><Field label={i18n.text(messages.resourceId)}>{resource.resource_id}</Field></dl>
  </div>;
}

function RenameHeader({ args, result }: ToolRenderProps<z.infer<typeof ResourceRenameResult.schema>>) {
  return <ToolHeader label={useI18n().text(messages.rename)}
    subject={result?.data?.title ?? inputText(args, "title")}
    meta={result?.data?.resource_id ?? inputText(args, "resource_id")} />;
}
const renameView = { headerRenderer: RenameHeader };
const listView = { headerRenderer: ListHeader, bodyRenderer: ListBody };
const agentListView = { headerRenderer: AgentListHeader, bodyRenderer: AgentListBody };
const inspectView = { headerRenderer: InspectHeader, bodyRenderer: InspectBody };
const createView = { headerRenderer: CreateHeader, bodyRenderer: CreateBody };
const removeView = { headerRenderer: RemoveHeader, bodyRenderer: RemoveBody };

export default {
  prepare: prepareCreationDirectory,
  resources: [], cards: [],
  tools: [
    toolRenderer(AgentListResult, {
      label: messages.agents, icon: <Users className="size-3.5" />,
      input: { headerRenderer: AgentListHeader }, execution: agentListView, result: agentListView,
    }),
    toolRenderer(CreationListResult, {
      label: messages.list, icon: <ListPlus className="size-3.5" />,
      input: { headerRenderer: ListHeader }, execution: listView, result: listView,
    }),
    toolRenderer(CreationInspectResult, {
      label: messages.inspect, icon: <ScanSearch className="size-3.5" />,
      input: { headerRenderer: InspectHeader }, execution: inspectView, result: inspectView,
    }),
    toolRenderer(ResourceCreateResult, {
      label: messages.create, icon: <CirclePlus className="size-3.5" />,
      input: { headerRenderer: CreateHeader }, execution: createView, result: createView,
    }),
    toolRenderer(ResourceRemoveResult, {
      label: messages.remove, icon: <CircleMinus className="size-3.5" />,
      input: { headerRenderer: RemoveHeader }, execution: removeView, result: removeView,
    }),
    toolRenderer(ResourceRenameResult, {
      label: messages.rename, icon: <PenLine className="size-3.5" />,
      input: renameView, execution: renameView, result: renameView,
    }),
  ],
} satisfies RendererModule;
