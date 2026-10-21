import type { ReactNode } from "react";
import type { z } from "zod";
import { ListPlus, ScanSearch, CirclePlus, CircleMinus } from "lucide-react";
import { toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { JsonView } from "@atelier/ui/json-view";
import { ToolDetails } from "@atelier/ui/tool-content";
import { ToolHeader } from "@atelier/ui/tool-header";
import { ItemGroup, Item, ItemContent, ItemTitle, ItemDescription } from "@atelier/ui/ui/item";
import { resourceMessages as messages } from "../messages/resources";
import { inputText } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { CreationListResult, CreationInspectResult, ResourceCreateResult, ResourceRemoveResult } from "./contract";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1">
    <dt className="type-caption text-muted-foreground">{label}</dt>
    <dd className="type-caption break-all font-mono">{children}</dd>
  </div>;
}

type ListProps = ToolRenderProps<z.infer<typeof CreationListResult.schema>>;
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
        <ItemTitle className="break-all font-mono">{entry.id}</ItemTitle>
        <ItemDescription className="line-clamp-none whitespace-pre-wrap">{entry.description}</ItemDescription>
        <dl><Field label={i18n.text(messages.kind)}>{entry.resourceKind}</Field></dl>
      </ItemContent>
    </Item>)}</ItemGroup>
    {entries.length > TOOL_BODY_LINE_LIMIT && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(messages.omitted, { count: entries.length - TOOL_BODY_LINE_LIMIT })}
    </p>}
  </div>;
}

type InspectProps = ToolRenderProps<z.infer<typeof CreationInspectResult.schema>>;
function InspectHeader({ args, result }: InspectProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.inspect)} monospace
    subject={result?.data?.id ?? inputText(args, "creation_id")} />;
}
function InspectBody({ result }: InspectProps) {
  const i18n = useI18n();
  const entry = result?.data;
  if (!entry) return null;
  return <div className="space-y-3">
    <p className="type-caption whitespace-pre-wrap break-words">{entry.description}</p>
    <dl className="space-y-2">
      <Field label={i18n.text(messages.entry)}>{entry.id}</Field>
      <Field label={i18n.text(messages.kind)}>{entry.resourceKind}</Field>
    </dl>
    {!!entry.guidelines.length && <section className="space-y-2">
      <p className="type-label">{i18n.text(messages.guidelines)}</p>
      <ul className="list-disc space-y-1 pl-4 type-caption whitespace-pre-wrap break-words">
        {entry.guidelines.map((line, index) => <li key={index}>{line}</li>)}
      </ul>
    </section>}
    <ToolDetails label={i18n.text(messages.inputSchema)}><JsonView value={entry.input} /></ToolDetails>
  </div>;
}

type CreateProps = ToolRenderProps<z.infer<typeof ResourceCreateResult.schema>>;
function CreateHeader({ args }: CreateProps) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.create)} subject={inputText(args, "creation_id")} monospace />;
}
function CreateBody({ result }: CreateProps) {
  const i18n = useI18n();
  const resource = result?.data;
  if (!resource) return null;
  return <div className="space-y-3">
    {result.kind === "succeeded" && <p className="type-caption">{i18n.text(messages.created)}</p>}
    <dl className="space-y-2">
      <Field label={i18n.text(messages.resourceId)}>{resource.resource_id}</Field>
      <Field label={i18n.text(messages.kind)}>{resource.type}</Field>
    </dl>
  </div>;
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

const listView = { headerRenderer: ListHeader, bodyRenderer: ListBody };
const inspectView = { headerRenderer: InspectHeader, bodyRenderer: InspectBody };
const createView = { headerRenderer: CreateHeader, bodyRenderer: CreateBody };
const removeView = { headerRenderer: RemoveHeader, bodyRenderer: RemoveBody };

export default {
  resources: [], cards: [],
  tools: [
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
  ],
} satisfies RendererModule;
