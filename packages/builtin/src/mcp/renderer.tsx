import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Server, Settings } from "lucide-react";
import { useI18n, useRendererSettings, creationEntry, cardRenderer, CardHeader, type RendererModule } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { VirtualList } from "@asterism-app/ui/ui/virtual-list";
import { cn } from "@asterism-app/ui/utils";
import { McpHost, CreateMcpHost, McpHostView, mcpServerLocation } from "./contract";
import { ReadMcp, withValues, type McpServerState } from "@asterism-app/sdk/contracts";
import { mcpMessages as messages } from "@asterism-app/ui/messages/mcp";
import { useMcpTools } from "@asterism-app/ui/mcp-status";
import { Instructions, ServerError, ServerSummary, ToolEntry, type ToolEntryData } from "./views";
import { mcpToolRenderers } from "./tool-views";

import { mcpCard as appearance } from "../shared/card-appearance.ts";
/** Columns: expand arrow · status · name · tool count; expanded content aligns with the name column. */
const columns = "grid grid-cols-[0.875rem_0.875rem_minmax(0,1fr)_auto] gap-x-1.5";
const detail = "col-[3/-1] min-w-0";

function useOpenSettings() {
  const settings = useRendererSettings();
  return () => settings.openHost("mcp");
}

/** Titlebar entry point: server management is in the MCP section of the built-in plugin settings. */
function HostHeader() {
  const i18n = useI18n(), openSettings = useOpenSettings();
  return <CardHeader actions={<IconButton size="icon-xs" label={i18n.text(messages.openSettings)} onClick={openSettings}><Settings /></IconButton>} />;
}

type Catalog = ReturnType<typeof useMcpTools>;

/** Catalog subscriptions stay mounted outside virtual rows while their server is expanded. */
function ServerCatalog({ id, onChange }: { id: string; onChange(id: string, catalog: Catalog): void }) {
  const { directory, error } = useMcpTools(id, true);
  useEffect(() => { onChange(id, { directory, error }); }, [id, directory, error, onChange]);
  return null;
}

function ServerDetails({ server, catalog }: { server: McpServerState; catalog: Catalog | undefined }) {
  const i18n = useI18n();
  const { directory, error } = catalog ?? {};
  return <div className="flex min-w-0 flex-col gap-2 pb-2">
    {server.error && <pre className="type-caption whitespace-pre-wrap break-words text-destructive select-text">{server.error}</pre>}
    {error && <p className="type-caption text-destructive">{i18n.text(error)}</p>}
    {directory === undefined && !error ? <Spinner className="size-3.5 text-muted-foreground motion-reduce:animate-none" />
      : directory === null ? <p className="type-caption text-muted-foreground">{i18n.text(messages.unindexedHint)}</p>
        : directory && <>
          {directory.instructions && <Instructions text={directory.instructions} />}
          {!directory.tools.length && <p className="type-caption text-muted-foreground">{i18n.text(messages.noTools)}</p>}
        </>}
  </div>;
}

/** A single server: status and cached tools; connection management belongs to settings. */
function ServerRow({ server, open, onToggle, onFocus }: { server: McpServerState; open: boolean; onToggle(): void; onFocus(): void }) {
  const i18n = useI18n();
  return <div className={columns} onFocusCapture={onFocus}>
    <div className={cn("col-span-full grid min-h-8 grid-cols-subgrid items-center py-1", !server.enabled && "opacity-60")}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        className="col-span-4 grid grid-cols-subgrid items-center rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        <ServerSummary server={server} />
      </button>
    </div>
    <p role="status" className={cn(detail, "type-caption pb-1 text-muted-foreground")}>
      {server.enabled ? i18n.formatMessage(messages.state, { state: server.connection }) : i18n.text(messages.disabled)}
      {server.enabled && server.connection === "awaiting_auth" && <>{" · "}{i18n.text(messages.authorizeInSettings)}</>}
    </p>
    {!open && <ServerError error={server.error} className={detail} />}
  </div>;
}

type HostRow = { kind: "server"; key: string; server: McpServerState }
  | { kind: "details"; key: string; server: McpServerState }
  | { kind: "tool"; key: string; tool: ToolEntryData };

function HostBody({ data }: { data: { servers: McpServerState[] } }) {
  const i18n = useI18n(), openSettings = useOpenSettings();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [catalogs, setCatalogs] = useState<Record<string, Catalog>>({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const onCatalog = useCallback((id: string, catalog: Catalog) => {
    setCatalogs(current => ({ ...current, [id]: catalog }));
  }, []);
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  if (!data.servers.length) return <div className="nodrag nopan flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-2">
    <p className="type-caption text-center text-balance text-muted-foreground">{i18n.text(messages.empty)}</p>
    <Button variant="outline" size="xs" onClick={openSettings}><Settings />{i18n.text(messages.openSettings)}</Button>
  </div>;
  // Tools are peers in the virtual list, so a large expanded catalog does not become one unbounded row.
  const rows = data.servers.flatMap((server): HostRow[] => [
    { kind: "server", key: `server:${server.id}`, server },
    ...(expanded.has(server.id) ? [
      { kind: "details" as const, key: `details:${server.id}`, server },
      ...(catalogs[server.id]?.directory?.tools ?? []).map((tool, index): HostRow => ({
        kind: "tool", key: `tool:${server.id}/${tool.name}/${index}`, tool,
      })),
    ] : []),
  ]);
  const focusedIndex = rows.findIndex(row => row.key === focusedKey);
  return <>
    {data.servers.filter(server => expanded.has(server.id)).map(server =>
      <ServerCatalog key={server.id} id={server.id} onChange={onCatalog} />)}
    <VirtualList data={rows} keepMounted={focusedIndex >= 0 ? [focusedIndex] : []} className="nodrag nopan" viewportClassName="px-2 py-1.5">
      {row => row.kind === "server"
        ? <ServerRow key={row.key} server={row.server} open={expanded.has(row.server.id)} onToggle={() => toggle(row.server.id)}
          onFocus={() => setFocusedKey(row.key)} />
        : <div key={row.key} className={columns}><div className={detail}>
          {row.kind === "details" ? <ServerDetails server={row.server} catalog={catalogs[row.server.id]} />
            : <div className="pb-2"><ToolEntry {...row.tool} /></div>}
        </div></div>}
    </VirtualList>
  </>;
}

export default {
  resources: [{ kind: McpHost.kind, label: messages.title, icon: <Server className="size-4" />, card: appearance,
    referenceTargets: {
      kind: "list",
      async list({ calls, signal }) {
        const servers = await calls.invoke(ReadMcp, {}, { signal });
        return servers.map(server => ({ label: server.name, location: mcpServerLocation(server.id), keywords: [server.id],
          detail: server.enabled ? withValues(messages.state, { state: server.connection }) : messages.disabled }));
      },
    },
  }],
  cards: [cardRenderer(McpHostView, { ...appearance, Body: HostBody, Header: HostHeader })],
  tools: mcpToolRenderers,
  creations: [creationEntry(CreateMcpHost, { id: "asterism.builtin/mcp.blank", label: messages.title, icon: <Server className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "MCP Host" } } } })],
} satisfies RendererModule;
