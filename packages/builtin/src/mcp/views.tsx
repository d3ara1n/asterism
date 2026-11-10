import { useI18n } from "@asterism-app/sdk/renderer";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { ItemGroup, Item, ItemContent, ItemTitle, ItemDescription, ItemMedia } from "@asterism-app/ui/ui/item";
import { cn } from "@asterism-app/ui/utils";
import type { ConnectionPhase } from "@asterism-app/sdk/contracts";
import { mcpMessages as messages } from "@asterism-app/ui/messages/mcp";
import { phaseTone } from "@asterism-app/ui/mcp-status";

/** Server summary shared by host cards, catalog results, and connection results: status, name, and tool count (unindexed when no catalog has been established). */
export interface ServerSummaryData { name: string; enabled: boolean; connection: ConnectionPhase; indexed: boolean; toolCount: number; error: string | null }

export function ServerSummary({ server }: { server: ServerSummaryData }) {
  const i18n = useI18n();
  return <>
    <StatusIcon tone={server.enabled ? phaseTone[server.connection] : "neutral"} className="size-3.5 shrink-0" />
    <span className="sr-only">{server.enabled ? i18n.formatMessage(messages.state, { state: server.connection }) : i18n.text(messages.disabled)}</span>
    <span className="type-body min-w-0 truncate" title={server.name}>{server.name}</span>
    <span className="type-caption ml-auto shrink-0 tabular-nums text-muted-foreground">
      {server.indexed ? i18n.formatMessage(messages.tools, { count: server.toolCount }) : i18n.text(messages.unindexed)}
    </span>
  </>;
}

/** Single-line error when collapsed; read the full error in the expanded card area or result details. */
export function ServerError({ error, className }: { error: string | null; className?: string }) {
  return error ? <p className={cn("type-caption truncate text-destructive", className)} title={error}>{error}</p> : null;
}

/** Compact outline item for tool results: status, name, and tool count on one row; an error adds one clipped line beneath the name. */
export function ServerItem({ server, listItem = false }: { server: ServerSummaryData; listItem?: boolean }) {
  const i18n = useI18n();
  return <Item role={listItem ? "listitem" : undefined} variant="outline" size="sm"
    className={cn("min-w-0 flex-nowrap gap-2 px-2.5 py-1.5", !server.enabled && "opacity-60")}>
    <ItemMedia><StatusIcon tone={server.enabled ? phaseTone[server.connection] : "neutral"} className="size-3.5" /></ItemMedia>
    <ItemContent className="min-w-0 gap-0">
      <ItemTitle className="w-full min-w-0">
        <span className="min-w-0 truncate" title={server.name}>{server.name}</span>
        <span className="sr-only">{server.enabled ? i18n.formatMessage(messages.state, { state: server.connection }) : i18n.text(messages.disabled)}</span>
      </ItemTitle>
      {server.error && <ItemDescription className="type-caption line-clamp-1 break-all text-destructive" title={server.error}>{server.error}</ItemDescription>}
    </ItemContent>
    <span className="type-caption shrink-0 tabular-nums text-muted-foreground">
      {server.indexed ? i18n.formatMessage(messages.tools, { count: server.toolCount }) : i18n.text(messages.unindexed)}
    </span>
  </Item>;
}

/** Server collections can be long: items flow into as many columns as the result width allows. */
export function ServerItems({ servers }: { servers: readonly ServerSummaryData[] }) {
  return <div className="@container/mcp-servers">
    <ItemGroup className="grid grid-cols-1 gap-1.5 @min-[28rem]/mcp-servers:grid-cols-2 @min-[48rem]/mcp-servers:grid-cols-3">
      {servers.map((server, index) => <ServerItem key={index} server={server} listItem />)}
    </ItemGroup>
  </div>;
}

export interface ToolEntryData { name: string; title?: string; description?: string; server?: string }

function ToolEntry({ name, title, description, server }: ToolEntryData) {
  return <div className="flex min-w-0 flex-col gap-0.5">
    <span className="type-code truncate text-xs" title={name} translate="no">{title ? `${title} · ${name}` : name}</span>
    {server && <span className="type-caption text-muted-foreground" translate="no">{server}</span>}
    {description && <span className="type-caption line-clamp-2 text-muted-foreground select-text" title={description}>{description}</span>}
  </div>;
}
const toolKey = (tool: ToolEntryData, index: number) => `${tool.server ?? ""}/${tool.name}/${index}`;

/** Tool entries flow with their containing card or paginated result, without a nested scroll area. */
export function ToolList({ tools }: { tools: readonly ToolEntryData[] }) {
  return <ul className="flex flex-col gap-2">{tools.map((tool, index) => <li key={toolKey(tool, index)}><ToolEntry {...tool} /></li>)}</ul>;
}

export function Instructions({ text }: { text: string }) {
  const i18n = useI18n();
  return <div className="flex flex-col gap-0.5">
    <p className="type-label">{i18n.text(messages.instructions)}</p>
    <p className="type-caption line-clamp-3 whitespace-pre-wrap text-muted-foreground select-text" title={text}>{text}</p>
  </div>;
}

/** Paginated results deliver only one page; indicate remaining entries when the total exceeds this page. */
export function PageNote({ shown, total }: { shown: number; total: number }) {
  const i18n = useI18n();
  return total > shown ? <p className="type-caption tabular-nums text-muted-foreground">{i18n.formatMessage(messages.page, { shown, total })}</p> : null;
}
