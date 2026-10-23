import { Network } from "lucide-react";
import { useI18n, useRendererSettings, creationEntry, cardRenderer, toolRenderer, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { McpHost, CreateMcpHost, McpHostView, McpList, McpSearch, McpInspect, McpConnect, McpCall, type McpCallData } from "./contract";
import { mcpMessages as messages } from "../messages/mcp";

const appearance = { width: 340, height: 260, minWidth: 280, minHeight: 160 };
function DirectoryBody({ result }: ToolRenderProps) {
  return result?.data == null ? null : <pre className="type-caption select-text whitespace-pre-wrap break-words">{JSON.stringify(result.data, null, 2)}</pre>;
}
function CallBody({ result }: ToolRenderProps<McpCallData>) {
  const data = result?.data;
  return data ? <div className="type-caption flex flex-col gap-2 select-text">
    <p>{data.serverName} / {data.toolName}</p>
    {data.progress && <p>{data.progress.message} {data.progress.completed}{data.progress.total !== undefined ? ` / ${data.progress.total}` : ""}</p>}
    {data.parts.map((part, index) => part.kind === "text" ? <p key={index} className="whitespace-pre-wrap break-words">{part.text}</p>
      : <p key={index}>{part.filename ?? part.mediaType}</p>)}
    {data.structuredContent !== undefined && <pre className="whitespace-pre-wrap break-words">{JSON.stringify(data.structuredContent, null, 2)}</pre>}
  </div> : null;
}
export default {
  resources: [{ kind: McpHost.kind, label: messages.title, icon: <Network className="size-4" />, card: appearance }],
  cards: [cardRenderer(McpHostView, { ...appearance, Body: ({ data }) => {
    const i18n = useI18n(), settings = useRendererSettings();
    return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      {!data.servers.length && <p className="type-caption text-muted-foreground">{i18n.text(messages.empty)}</p>}
      {data.servers.map(server => <div key={server.id} className="flex flex-col gap-1">
        <p className="type-body">{server.name}</p>
        <p className="type-caption text-muted-foreground">{i18n.formatMessage(messages.state, { state: server.connection })}{" · "}{server.indexed ? i18n.formatMessage(messages.tools, { count: server.toolCount }) : i18n.text(messages.unindexed)}</p>
        {server.error && <p className="type-caption text-destructive break-words">{server.error}</p>}
      </div>)}
      <Button variant="outline" size="sm" className="self-start" onClick={() => settings.open("atelier.builtin", "mcp")}>{i18n.text(messages.openSettings)}</Button>
    </div>;
  } })],
  tools: [
    toolRenderer(McpList, { label: messages.list, result: { bodyRenderer: DirectoryBody } }),
    toolRenderer(McpSearch, { label: messages.search, result: { bodyRenderer: DirectoryBody } }),
    toolRenderer(McpInspect, { label: messages.inspect, result: { bodyRenderer: DirectoryBody } }),
    toolRenderer(McpConnect, { label: messages.connect, result: { bodyRenderer: DirectoryBody } }),
    toolRenderer(McpCall, { label: messages.call, execution: { bodyRenderer: CallBody }, result: { bodyRenderer: CallBody } }),
  ],
  creations: [creationEntry(CreateMcpHost, { id: "atelier.builtin/mcp.blank", label: messages.title, icon: <Network className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "MCP Host" } } } })],
} satisfies RendererModule;
