import { useState } from "react";
import { ChevronRight, Network, RefreshCw, Settings } from "lucide-react";
import { useI18n, useRendererCalls, useRendererSettings, creationEntry, cardRenderer, type RendererModule } from "@asterism/sdk/renderer";
import { Button } from "@asterism/ui/ui/button";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { Spinner } from "@asterism/ui/ui/spinner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism/ui/ui/collapsible";
import { cn } from "@asterism/ui/utils";
import { McpHost, CreateMcpHost, McpHostView, ConnectMcpServer, type McpServerState } from "./contract";
import { mcpMessages as messages } from "../messages/mcp";
import { useMcpTools } from "./status";
import { Instructions, ServerError, ServerSummary, VirtualToolList } from "./views";
import { mcpToolRenderers } from "./tool-views";
import { useLifetimeSignal } from "../shared/use-lifetime";

import { mcpCard as appearance } from "../shared/card-appearance.ts";
/** 列：展开箭头 · 状态 · 名称 · 工具数 · 操作；各行以 subgrid 共用列宽，展开区从名称列起对齐。 */
const columns = "grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] gap-x-1.5";
const detail = "col-[3/-1] min-w-0";

function useOpenSettings() {
  const settings = useRendererSettings();
  return () => settings.open("asterism.builtin", "mcp");
}

/** 标题栏入口：服务器管理位于内置插件设置的 MCP 分区。 */
function HostActions() {
  const i18n = useI18n(), openSettings = useOpenSettings();
  return <IconButton size="icon-xs" label={i18n.text(messages.openSettings)} onClick={openSettings}><Settings /></IconButton>;
}

/** 展开后才读取缓存目录；目录随模块状态事件刷新。 */
function ServerTools({ server }: { server: McpServerState }) {
  const i18n = useI18n();
  const { directory, error } = useMcpTools(server.id, true);
  return <div className="flex min-w-0 flex-col gap-2 pb-2">
    {server.error && <pre className="type-caption max-h-32 overflow-auto whitespace-pre-wrap break-words text-destructive select-text">{server.error}</pre>}
    {error && <p className="type-caption text-destructive">{error}</p>}
    {directory === undefined && !error ? <Spinner className="size-3.5 text-muted-foreground motion-reduce:animate-none" />
      : directory === null ? <p className="type-caption text-muted-foreground">{i18n.text(messages.unindexedHint)}</p>
        : directory && <>
          {directory.instructions && <Instructions text={directory.instructions} />}
          {directory.tools.length ? <VirtualToolList tools={directory.tools} />
            : <p className="type-caption text-muted-foreground">{i18n.text(messages.noTools)}</p>}
        </>}
  </div>;
}

/** 单台服务器：行内显示状态与当前可用的连接操作，展开审阅缓存工具。 */
function ServerRow({ server }: { server: McpServerState }) {
  const i18n = useI18n(), calls = useRendererCalls(), lifetime = useLifetimeSignal();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  // 连接在后台进行，结果经资源投影呈现；这里只防止同一入口重入。
  const connect = () => {
    const signal = lifetime();
    setBusy(true);
    void calls.invoke(ConnectMcpServer, { serverId: server.id }, { signal }).catch(() => {}).finally(() => { if (!signal.aborted) setBusy(false); });
  };
  const action = !server.enabled ? <span className="type-caption text-muted-foreground">{i18n.text(messages.disabled)}</span>
    : server.connection === "awaiting_auth" && server.authorizationUrl
      ? <Button variant="outline" size="xs" asChild><a href={server.authorizationUrl} target="_blank" rel="noopener noreferrer">{i18n.text(messages.authorize)}</a></Button>
      : server.connection === "connected"
        ? <IconButton size="icon-xs" label={i18n.text(messages.refresh)} disabled={busy} onClick={connect}><RefreshCw className={cn(busy && "animate-spin motion-reduce:animate-none")} /></IconButton>
        : server.connection === "connecting" ? null
          : <Button variant="outline" size="xs" disabled={busy} onClick={connect}>{i18n.text(messages.connect)}</Button>;
  return <Collapsible open={open} onOpenChange={setOpen} className="col-span-full grid grid-cols-subgrid">
    <div className={cn("col-span-full grid min-h-8 grid-cols-subgrid items-center py-1", !server.enabled && "opacity-60")}>
      <CollapsibleTrigger asChild>
        <button type="button" className="col-span-4 grid grid-cols-subgrid items-center rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")} />
          <ServerSummary server={server} />
        </button>
      </CollapsibleTrigger>
      <div className="flex shrink-0 items-center justify-end">{action}</div>
    </div>
    {!open && <ServerError error={server.error} className={detail} />}
    <CollapsibleContent className={detail}>{open && <ServerTools server={server} />}</CollapsibleContent>
  </Collapsible>;
}

function HostBody({ data }: { data: { servers: McpServerState[] } }) {
  const i18n = useI18n(), openSettings = useOpenSettings();
  if (!data.servers.length) return <div className="nodrag nopan flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-2">
    <p className="type-caption text-center text-balance text-muted-foreground">{i18n.text(messages.empty)}</p>
    <Button variant="outline" size="xs" onClick={openSettings}><Settings />{i18n.text(messages.openSettings)}</Button>
  </div>;
  return <div className={cn("nodrag nopan min-h-0 flex-1 content-start overflow-auto px-2 py-1.5", columns)}>
    {data.servers.map(server => <ServerRow key={server.id} server={server} />)}
  </div>;
}

export default {
  resources: [{ kind: McpHost.kind, label: messages.title, icon: <Network className="size-4" />, card: appearance }],
  cards: [cardRenderer(McpHostView, { ...appearance, Body: HostBody, Actions: HostActions })],
  tools: mcpToolRenderers,
  creations: [creationEntry(CreateMcpHost, { id: "asterism.builtin/mcp.blank", label: messages.title, icon: <Network className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "MCP Host" } } } })],
} satisfies RendererModule;
