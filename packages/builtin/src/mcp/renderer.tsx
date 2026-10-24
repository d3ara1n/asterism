import { useEffect, useRef, useState } from "react";
import { ChevronRight, Network, RefreshCw, Settings } from "lucide-react";
import { useI18n, useRendererCalls, useRendererSettings, creationEntry, cardRenderer, type RendererModule } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { IconButton } from "@atelier/ui/ui/icon-button";
import { Spinner } from "@atelier/ui/ui/spinner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@atelier/ui/ui/collapsible";
import { cn } from "@atelier/ui/utils";
import { McpHost, CreateMcpHost, McpHostView, ConnectMcpServer, type McpServerState } from "./contract";
import { mcpMessages as messages } from "../messages/mcp";
import { useMcpTools } from "./status";
import { Instructions, ServerError, ServerSummary, ToolList } from "./views";
import { mcpToolRenderers } from "./tool-views";

const appearance = { width: 360, height: 300, minWidth: 280, minHeight: 160 };

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
          {directory.instructions && <Instructions text={directory.instructions} />}
          {directory.tools.length ? <ToolList tools={directory.tools} />
            : <p className="type-caption text-muted-foreground">{i18n.text(messages.noTools)}</p>}
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
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <ServerSummary server={server} />
        </button>
      </CollapsibleTrigger>
      <div className="flex shrink-0 items-center">{action}</div>
    </div>
    {!open && <ServerError error={server.error} className="pl-7 pr-2" />}
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
  tools: mcpToolRenderers,
  creations: [creationEntry(CreateMcpHost, { id: "atelier.builtin/mcp.blank", label: messages.title, icon: <Network className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "MCP Host" } } } })],
} satisfies RendererModule;
