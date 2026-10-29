import { useState } from "react";
import { ChevronRight, Server, Settings } from "lucide-react";
import { useI18n, useRendererSettings, creationEntry, cardRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { cn } from "@asterism-app/ui/utils";
import { McpHost, CreateMcpHost, McpHostView } from "./contract";
import type { McpServerState } from "@asterism-app/sdk/contracts";
import { mcpMessages as messages } from "@asterism-app/ui/messages/mcp";
import { useMcpTools } from "@asterism-app/ui/mcp-status";
import { Instructions, ServerError, ServerSummary, VirtualToolList } from "./views";
import { mcpToolRenderers } from "./tool-views";

import { mcpCard as appearance } from "../shared/card-appearance.ts";
/** Columns: expand arrow · status · name · tool count; expanded content aligns with the name column. */
const columns = "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] gap-x-1.5";
const detail = "col-[3/-1] min-w-0";

function useOpenSettings() {
  const settings = useRendererSettings();
  return () => settings.openHost("mcp");
}

/** Titlebar entry point: server management is in the MCP section of the built-in plugin settings. */
function HostActions() {
  const i18n = useI18n(), openSettings = useOpenSettings();
  return <IconButton size="icon-xs" label={i18n.text(messages.openSettings)} onClick={openSettings}><Settings /></IconButton>;
}

/** Reads the cached catalog only when expanded; module state events refresh the catalog. */
function ServerTools({ server }: { server: McpServerState }) {
  const i18n = useI18n();
  const { directory, error } = useMcpTools(server.id, true);
  return <div className="flex min-w-0 flex-col gap-2 pb-2">
    {server.error && <pre className="type-caption max-h-32 overflow-auto whitespace-pre-wrap break-words text-destructive select-text">{server.error}</pre>}
    {error && <p className="type-caption text-destructive">{i18n.text(error)}</p>}
    {directory === undefined && !error ? <Spinner className="size-3.5 text-muted-foreground motion-reduce:animate-none" />
      : directory === null ? <p className="type-caption text-muted-foreground">{i18n.text(messages.unindexedHint)}</p>
        : directory && <>
          {directory.instructions && <Instructions text={directory.instructions} />}
          {directory.tools.length ? <VirtualToolList tools={directory.tools} />
            : <p className="type-caption text-muted-foreground">{i18n.text(messages.noTools)}</p>}
        </>}
  </div>;
}

/** A single server: status and cached tools; connection management belongs to settings. */
function ServerRow({ server }: { server: McpServerState }) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  return <Collapsible open={open} onOpenChange={setOpen} className="col-span-full grid grid-cols-subgrid">
    <div className={cn("col-span-full grid min-h-8 grid-cols-subgrid items-center py-1", !server.enabled && "opacity-60")}>
      <CollapsibleTrigger asChild>
        <button type="button" className="col-span-4 grid grid-cols-subgrid items-center rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")} />
          <ServerSummary server={server} />
        </button>
      </CollapsibleTrigger>
    </div>
    <p role="status" className={cn(detail, "type-caption pb-1 text-muted-foreground")}>
      {server.enabled ? i18n.formatMessage(messages.state, { state: server.connection }) : i18n.text(messages.disabled)}
      {server.enabled && server.connection === "awaiting_auth" && <>{" · "}{i18n.text(messages.authorizeInSettings)}</>}
    </p>
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
  resources: [{ kind: McpHost.kind, label: messages.title, icon: <Server className="size-4" />, card: appearance }],
  cards: [cardRenderer(McpHostView, { ...appearance, Body: HostBody, Actions: HostActions })],
  tools: mcpToolRenderers,
  creations: [creationEntry(CreateMcpHost, { id: "asterism.builtin/mcp.blank", label: messages.title, icon: <Server className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "MCP Host" } } } })],
} satisfies RendererModule;
