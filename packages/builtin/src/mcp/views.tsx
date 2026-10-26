import { Virtualizer } from "virtua";
import { useI18n } from "@asterism/sdk/renderer";
import { StatusIcon } from "@asterism/ui/ui/status";
import { cn } from "@asterism/ui/utils";
import type { ConnectionPhase } from "./contract";
import { mcpMessages as messages } from "../messages/mcp";
import { phaseTone } from "./status";

/** 主机卡片、目录结果与连接结果共用的服务器摘要：状态、名称与工具数量（未建立目录时显示未索引）。 */
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

/** 收起时的单行错误；完整错误在卡片展开区或结果详情中阅读。 */
export function ServerError({ error, className }: { error: string | null; className?: string }) {
  return error ? <p className={cn("type-caption truncate text-destructive", className)} title={error}>{error}</p> : null;
}

/** 工具结果中的服务器行：停用服务器弱化，错误缩进到名称下方。 */
export function ServerLine({ server }: { server: ServerSummaryData }) {
  return <div className={cn("flex min-w-0 flex-col gap-0.5", !server.enabled && "opacity-60")}>
    <div className="flex min-w-0 items-center gap-1.5"><ServerSummary server={server} /></div>
    <ServerError error={server.error} className="pl-5" />
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

/** 分页结果中的工具条目；条目数受单页限制，直接渲染。 */
export function ToolList({ tools }: { tools: readonly ToolEntryData[] }) {
  return <ul className="flex flex-col gap-2">{tools.map((tool, index) => <li key={toolKey(tool, index)}><ToolEntry {...tool} /></li>)}</ul>;
}

/** 卡片中的完整缓存目录可达数百条：在有界的局部滚动区内虚拟化，少量条目时高度随内容收缩。 */
export function VirtualToolList({ tools }: { tools: readonly ToolEntryData[] }) {
  return <div className="max-h-72 overflow-y-auto">
    <Virtualizer as="ul" item="li" data={tools}>
      {(tool, index) => <div key={toolKey(tool, index)} className="pb-2"><ToolEntry {...tool} /></div>}
    </Virtualizer>
  </div>;
}

export function Instructions({ text }: { text: string }) {
  const i18n = useI18n();
  return <div className="flex flex-col gap-0.5">
    <p className="type-label">{i18n.text(messages.instructions)}</p>
    <p className="type-caption line-clamp-3 whitespace-pre-wrap text-muted-foreground select-text" title={text}>{text}</p>
  </div>;
}

/** 分页结果只交付一页；总数大于本页时提示其余条目。 */
export function PageNote({ shown, total }: { shown: number; total: number }) {
  const i18n = useI18n();
  return total > shown ? <p className="type-caption tabular-nums text-muted-foreground">{i18n.formatMessage(messages.page, { shown, total })}</p> : null;
}
