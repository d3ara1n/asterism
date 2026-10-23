import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronRight, Network, RefreshCw, Settings } from "lucide-react";
import { useI18n, useRendererCalls, useRendererSettings, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Spinner } from "@atelier/ui/ui/spinner";
import { StatusIcon } from "@atelier/ui/ui/status";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@atelier/ui/ui/collapsible";
import { ToolHeader } from "@atelier/ui/tool-header";
import { cn } from "@atelier/ui/utils";
import type { Json, UiText } from "@atelier/sdk/contracts";
import { McpHost, CreateMcpHost, McpHostView, McpList, McpSearch, McpInspect, McpConnect, McpCall, ConnectMcpServer,
  type McpCallData, type McpServerState, type ConnectionPhase } from "./contract";
import { mcpMessages as messages } from "../messages/mcp";
import { phaseTone, useMcpTools } from "./status";

const appearance = { width: 360, height: 300, minWidth: 280, minHeight: 160 };

/** 参数在填充阶段可能不完整，只取已成形的字符串字段。 */
const field = (args: Json, key: string) => args && typeof args === "object" && !Array.isArray(args) && typeof args[key] === "string" && args[key] ? args[key] : undefined;
const toolIcon = <Network className="size-3.5" />;

// --- 目录工具 body 的安全字段访问 ---
function obj(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
}
function str(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function num(v: unknown): number | undefined { return typeof v === "number" ? v : undefined; }
function arr(v: unknown): unknown[] | undefined { return Array.isArray(v) ? v : undefined; }

/** 目录工具的标题显示操作对象：服务器、查询词或工具句柄。 */
function directoryHeader(label: UiText, subjectKey: string, metaKey?: string) {
  return function DirectoryHeader({ args }: ToolRenderProps) {
    const i18n = useI18n();
    return <ToolHeader label={i18n.text(label)} subject={field(args, subjectKey)} meta={metaKey && field(args, metaKey)} monospace={subjectKey !== "query"} />;
  };
}
function directory(contract: typeof McpList | typeof McpSearch | typeof McpInspect | typeof McpConnect, label: UiText, subjectKey: string, metaKey?: string, bodyRenderer?: ComponentType<ToolRenderProps>) {
  const headerRenderer = directoryHeader(label, subjectKey, metaKey);
  return toolRenderer(contract, { label, icon: toolIcon, input: { headerRenderer }, execution: { headerRenderer }, result: { headerRenderer, bodyRenderer } });
}

/** 调用标题：结果到达前显示参数中的工具句柄，之后显示服务器名称与远端工具名；执行中附带进度。 */
function CallHeader({ args, result }: ToolRenderProps<McpCallData>) {
  const i18n = useI18n();
  const data = result?.data;
  const progress = data?.progress;
  return <ToolHeader label={i18n.text(messages.call)} subject={data ? `${data.serverName} · ${data.toolName}` : field(args, "tool_id")} monospace={!data}
    meta={progress && `${progress.completed}${progress.total !== undefined ? ` / ${progress.total}` : ""}`} />;
}
/** mcp_call / mcp_connect 不展示 body；以组件形式传入，避免回落到 DefaultToolBody。 */
const noBody = () => null;
const callView = { headerRenderer: CallHeader, bodyRenderer: noBody };

// --- 目录工具 body：结果有已知结构，展示为可读视图 ---

/** 工具条目：在 list 和 search 结果中共用。 */
function ToolEntry({ name, title, description, server }: { name: string; title?: string; description?: string; server?: string }) {
  return <li className="flex min-w-0 flex-col gap-0.5">
    <span className="type-code truncate text-xs" title={name}>{title ? `${title} · ${name}` : name}</span>
    {server && <span className="type-caption text-muted-foreground">{server}</span>}
    {description && <span className="type-caption line-clamp-2 text-muted-foreground select-text" title={description}>{description}</span>}
  </li>;
}

/** mcp_list 结果：有 server 字段时展示工具列表，否则展示服务器列表。 */
function ListBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  const data = obj(result?.data);
  if (!data) return null;
  const items = arr(data.items) ?? [];
  const total = num(data.total);
  const isToolList = obj(data.server) !== undefined;
  if (items.length === 0) return null;
  return <div className="flex flex-col gap-1.5">
    {total !== undefined && total > items.length && <p className="type-caption tabular-nums text-muted-foreground">{items.length} / {total}</p>}
    <ul className="flex flex-col gap-2">
      {isToolList
        ? items.map((item, i) => {
            const it = obj(item); if (!it) return null;
            const name = str(it.name); if (!name) return null;
            return <ToolEntry key={i} name={name} title={str(it.title)} description={str(it.description)} />;
          })
        : items.map((item, i) => {
            const it = obj(item); if (!it) return null;
            const name = str(it.name); if (!name) return null;
            const connection = str(it.connection) as ConnectionPhase | undefined;
            const indexed = it.indexed === true;
            const toolCount = indexed ? num(it.tool_count) : undefined;
            return <li key={i} className="flex min-w-0 items-center gap-1.5">
              {connection !== undefined && <StatusIcon tone={phaseTone[connection]} className="size-3 shrink-0" />}
              <span className="type-body min-w-0 truncate">{name}</span>
              <span className="type-caption ml-auto shrink-0 tabular-nums text-muted-foreground">
                {toolCount !== undefined ? i18n.formatMessage(messages.tools, { count: toolCount }) : i18n.text(messages.unindexed)}
              </span>
            </li>;
          })
      }
    </ul>
  </div>;
}

/** mcp_search 结果：匹配工具列表，末尾提示未索引服务器。 */
function SearchBody({ result }: ToolRenderProps) {
  const data = obj(result?.data);
  if (!data) return null;
  const matches = obj(data.matches);
  const items = arr(matches?.items) ?? [];
  const total = num(matches?.total);
  const unindexed = arr(data.unindexed_servers) ?? [];
  if (items.length === 0 && unindexed.length === 0) return null;
  const unindexedNames = unindexed.map(s => str(obj(s)?.name)).filter(Boolean);
  return <div className="flex flex-col gap-2">
    {total !== undefined && total > items.length && <p className="type-caption tabular-nums text-muted-foreground">{items.length} / {total}</p>}
    {items.length > 0 && <ul className="flex flex-col gap-2">
      {items.map((item, i) => {
        const it = obj(item); if (!it) return null;
        const name = str(it.name); if (!name) return null;
        return <ToolEntry key={i} name={name} title={str(it.title)} description={str(it.description)} server={str(it.server)} />;
      })}
    </ul>}
    {unindexedNames.length > 0 && <p className="type-caption text-muted-foreground">
      {unindexedNames.join(", ")} — not indexed, connect to search
    </p>}
  </div>;
}

/** mcp_inspect 结果：工具描述、输入参数列表与服务器说明。 */
function InspectBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  const data = obj(result?.data);
  if (!data) return null;
  const description = str(data.description);
  const inputSchema = obj(data.inputSchema);
  const properties = inputSchema ? obj(inputSchema.properties) : undefined;
  const required = arr(inputSchema?.required)?.filter((v): v is string => typeof v === "string") ?? [];
  const serverInstructions = str(data.server_instructions);
  if (!description && !properties && !serverInstructions) return null;
  const params = properties ? Object.entries(properties) : [];
  return <div className="flex flex-col gap-3 select-text">
    {description && <p className="type-caption whitespace-pre-wrap break-words">{description}</p>}
    {params.length > 0 && <div className="flex flex-col gap-1.5">
      <p className="type-label">{i18n.text(messages.parameters)}</p>
      <ul className="flex flex-col gap-1.5">
        {params.map(([paramName, paramSchema]) => {
          const param = obj(paramSchema);
          const paramType = str(param?.type);
          const paramDesc = str(param?.description);
          const isRequired = required.includes(paramName);
          return <li key={paramName} className="flex min-w-0 flex-col gap-0.5">
            <span className="type-code flex items-baseline gap-1 text-xs">
              <span>{paramName}</span>
              {paramType && <span className="font-normal text-muted-foreground">{paramType}</span>}
              {isRequired && <span className="font-normal text-muted-foreground">*</span>}
            </span>
            {paramDesc && <span className="type-caption line-clamp-2 text-muted-foreground select-text" title={paramDesc}>{paramDesc}</span>}
          </li>;
        })}
      </ul>
    </div>}
    {serverInstructions && <div className="flex flex-col gap-0.5">
      <p className="type-label">{i18n.text(messages.instructions)}</p>
      <p className="type-caption line-clamp-3 whitespace-pre-wrap text-muted-foreground select-text" title={serverInstructions}>{serverInstructions}</p>
    </div>}
  </div>;
}

/** 标题栏入口：服务器管理位于内置插件设置的 MCP 分区。 */
function HostActions() {
  const i18n = useI18n(), settings = useRendererSettings();
  return <IconButton size="icon-xs" label={i18n.text(messages.openSettings)} onClick={() => settings.open("atelier.builtin", "mcp")}><Settings /></IconButton>;
}

/** 展开后才读取缓存目录；目录随模块状态事件刷新。 */
function ServerTools({ server }: { server: McpServerState }) {
  const i18n = useI18n();
  const { directory, error } = useMcpTools(server.id, true);
  return <div className="flex flex-col gap-2 pb-2 pl-7 pr-2">
    {server.error && <pre className="type-caption max-h-32 overflow-auto whitespace-pre-wrap break-words text-destructive select-text">{server.error}</pre>}
    {error && <p className="type-caption text-destructive">{error}</p>}
    {directory === undefined && !error ? <Spinner className="size-3.5 text-muted-foreground" />
      : directory === null ? <p className="type-caption text-muted-foreground">{i18n.text(messages.unindexedHint)}</p>
        : directory && <>
          {directory.instructions && <div className="flex flex-col gap-0.5">
            <p className="type-label">{i18n.text(messages.instructions)}</p>
            <p className="type-caption line-clamp-3 whitespace-pre-wrap select-text" title={directory.instructions}>{directory.instructions}</p>
          </div>}
          {directory.tools.length ? <ul className="flex flex-col gap-1.5">
            {directory.tools.map(tool => <li key={tool.name} className="flex min-w-0 flex-col">
              <span className="type-code truncate text-xs" title={tool.name}>{tool.title ? `${tool.title} · ${tool.name}` : tool.name}</span>
              {tool.description && <span className="type-caption line-clamp-2 text-muted-foreground select-text" title={tool.description}>{tool.description}</span>}
            </li>)}
          </ul> : <p className="type-caption text-muted-foreground">{i18n.text(messages.noTools)}</p>}
        </>}
  </div>;
}

/** 单台服务器：行内显示状态与当前可用的连接操作，展开审阅缓存工具。 */
function ServerRow({ server }: { server: McpServerState }) {
  const i18n = useI18n(), calls = useRendererCalls();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController>(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  // 连接在后台进行，结果经资源投影呈现；这里只防止同一入口重入。
  const connect = () => {
    const signal = lifetime.current.signal;
    setBusy(true);
    void calls.invoke(ConnectMcpServer, { serverId: server.id }, { signal }).catch(() => {}).finally(() => { if (!signal.aborted) setBusy(false); });
  };
  const action = !server.enabled ? <span className="type-caption text-muted-foreground">{i18n.text(messages.disabled)}</span>
    : server.connection === "awaiting_auth" && server.authorizationUrl
      ? <Button variant="outline" size="xs" asChild><a href={server.authorizationUrl} target="_blank" rel="noopener noreferrer">{i18n.text(messages.authorize)}</a></Button>
      : server.connection === "connected"
        ? <IconButton size="icon-xs" label={i18n.text(messages.refresh)} disabled={busy} onClick={connect}><RefreshCw className={cn(busy && "animate-spin")} /></IconButton>
        : server.connection === "connecting" ? null
          : <Button variant="outline" size="xs" disabled={busy} onClick={connect}>{i18n.text(messages.connect)}</Button>;
  return <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
    <div className={cn("flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1", !server.enabled && "opacity-60")}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={i18n.formatMessage(messages.state, { state: server.connection })}>
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <StatusIcon tone={server.enabled ? phaseTone[server.connection] : "neutral"} className="size-3.5 shrink-0" />
          <span className="type-body min-w-0 truncate" title={server.name}>{server.name}</span>
          <span className="type-caption ml-auto shrink-0 tabular-nums text-muted-foreground">
            {server.indexed ? i18n.formatMessage(messages.tools, { count: server.toolCount }) : i18n.text(messages.unindexed)}
          </span>
        </button>
      </CollapsibleTrigger>
      <div className="flex shrink-0 items-center">{action}</div>
    </div>
    {!open && server.error && <p className="type-caption truncate pl-7 pr-2 text-destructive" title={server.error}>{server.error}</p>}
    <CollapsibleContent>{open && <ServerTools server={server} />}</CollapsibleContent>
  </Collapsible>;
}

function HostBody({ data }: { data: { servers: McpServerState[] } }) {
  const i18n = useI18n();
  return <div className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-2">
    {data.servers.length
      ? data.servers.map(server => <ServerRow key={server.id} server={server} />)
      : <p className="type-caption p-1 text-muted-foreground">{i18n.text(messages.empty)}</p>}
  </div>;
}

export default {
  resources: [{ kind: McpHost.kind, label: messages.title, icon: <Network className="size-4" />, card: appearance }],
  cards: [cardRenderer(McpHostView, { ...appearance, Body: HostBody, Actions: HostActions })],
  tools: [
    directory(McpList, messages.list, "server_id", undefined, ListBody),
    directory(McpSearch, messages.search, "query", "server_id", SearchBody),
    directory(McpInspect, messages.inspect, "tool_id", undefined, InspectBody),
    directory(McpConnect, messages.connect, "server_id", undefined, noBody),
    toolRenderer(McpCall, { label: messages.call, icon: toolIcon, input: { headerRenderer: CallHeader }, execution: callView, result: callView }),
  ],
  creations: [creationEntry(CreateMcpHost, { id: "atelier.builtin/mcp.blank", label: messages.title, icon: <Network className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "MCP Host" } } } })],
} satisfies RendererModule;
