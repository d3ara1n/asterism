import type { ReactNode } from "react";
import { z } from "zod";
import { FileSearch, ListTree, Plug, Search, Zap } from "lucide-react";
import { toolRenderer, useI18n, useRendererObject, type ToolRenderProps } from "@atelier/sdk/renderer";
import type { Json, UiText } from "@atelier/sdk/contracts";
import { ToolHeader } from "@atelier/ui/tool-header";
import { formatCount } from "@atelier/ui/format-count";
import { McpList, McpSearch, McpInspect, McpConnect, McpCall, connectionPhases, type McpCallData } from "./contract";
import { mcpMessages as messages } from "../messages/mcp";
import { textMessages } from "../messages/text";
import { inputField, inputText, characterCount } from "../shared/tool-preview";
import { settledBodyViews } from "../shared/tool-views";
import { FilePreview } from "../agent/conversation/Files";
import { extraStructured, displayText } from "./content";
import { Instructions, PageNote, ServerLine, ToolList, type ServerSummaryData, type ToolEntryData } from "./views";

// --- 保存结果的展示解析：字段宽松，无法识别的结果只保留原始详情 ---

const serverSchema = z.object({
  name: z.string(), enabled: z.boolean(), connection: z.enum(connectionPhases),
  indexed: z.boolean(), tool_count: z.number(), error: z.string().nullable().optional(),
});
const toolSchema = z.object({ name: z.string(), title: z.string().optional(), description: z.string().optional(), server: z.string().optional() });
const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number() });
const listSchema = z.union([pageSchema(toolSchema).extend({ server: serverSchema }), pageSchema(serverSchema)]);
const searchSchema = z.object({
  matches: pageSchema(toolSchema),
  unindexed_servers: z.array(z.object({ name: z.string() })).default([]),
});
const parameterSchema = z.object({ type: z.unknown().optional(), description: z.string().optional() }).passthrough();
const inspectSchema = z.object({
  description: z.string().optional(), server_instructions: z.string().optional(),
  inputSchema: z.object({ properties: z.record(z.string(), parameterSchema).optional(), required: z.array(z.string()).optional() }).passthrough().optional(),
});

function toSummary(server: z.infer<typeof serverSchema>): ServerSummaryData {
  return { name: server.name, enabled: server.enabled, connection: server.connection, indexed: server.indexed, toolCount: server.tool_count, error: server.error ?? null };
}
function toTool(tool: z.infer<typeof toolSchema>, withServer: boolean): ToolEntryData {
  return { name: tool.name, title: tool.title, description: tool.description || undefined, server: withServer ? tool.server : undefined };
}
function parameterType(type: unknown) {
  return typeof type === "string" ? type : Array.isArray(type) ? type.filter(item => typeof item === "string").join(" | ") : undefined;
}
const parse = <T extends z.ZodType>(schema: T, data: Json | undefined) => {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data as z.infer<T> : undefined;
};

function Empty({ text }: { text: UiText }) {
  return <p className="type-caption text-muted-foreground">{useI18n().text(text)}</p>;
}

// --- 标题：操作名 · 操作对象 · 右侧结果数量或进度 ---

function ListHeader({ args, result }: ToolRenderProps) {
  const i18n = useI18n(), data = parse(listSchema, result?.data);
  return <ToolHeader label={i18n.text(messages.list)} subject={inputText(args, "server_id")} monospace
    meta={data && i18n.formatMessage("server" in data ? messages.tools : messages.serverCount, { count: data.total })} />;
}
function SearchHeader({ args, result }: ToolRenderProps) {
  const i18n = useI18n(), data = parse(searchSchema, result?.data);
  const query = inputText(args, "query"), server = inputText(args, "server_id");
  return <ToolHeader label={i18n.text(messages.search)} subject={query && server ? `${query} · ${server}` : query}
    meta={data && i18n.formatMessage(messages.matchCount, { count: data.matches.total })} />;
}
function InspectHeader({ args, result }: ToolRenderProps) {
  const i18n = useI18n(), data = parse(inspectSchema, result?.data);
  return <ToolHeader label={i18n.text(messages.inspect)} subject={inputText(args, "tool_id")} monospace
    meta={data && i18n.formatMessage(messages.parameterCount, { count: Object.keys(data.inputSchema?.properties ?? {}).length })} />;
}
function ConnectHeader({ args, result }: ToolRenderProps) {
  const i18n = useI18n(), data = parse(serverSchema, result?.data);
  return <ToolHeader label={i18n.text(messages.connectTool)} subject={inputText(args, "server_id")} monospace
    meta={data?.indexed && i18n.formatMessage(messages.tools, { count: data.tool_count })} />;
}

/** 执行中显示远端进度；终结后汇总返回内容的字数与文件数。标题始终保留调用的工具句柄。 */
function CallHeader({ args, phase, result }: ToolRenderProps<McpCallData>) {
  const i18n = useI18n(), data = result?.data;
  const progress = phase === "executing" ? data?.progress : undefined;
  const text = phase === "settled" && data ? data.parts.reduce((total, part) => total + (part.kind === "text" ? characterCount(part.text) : 0), 0) : 0;
  const files = phase === "settled" && data ? data.parts.filter(part => part.kind === "file").length : 0;
  const summary = [text > 0 && i18n.formatMessage(textMessages.toolTextCharacters, { count: formatCount(text) }),
    files > 0 && i18n.formatMessage(messages.fileCount, { count: files })].filter(Boolean).join(" · ");
  return <ToolHeader label={i18n.text(messages.call)} subject={inputText(args, "tool_id")} monospace
    meta={progress ? `${progress.completed}${progress.total !== undefined ? ` / ${progress.total}` : ""}` : summary || undefined} />;
}

// --- 目录工具正文：消费保存的结果，空结果显式说明 ---

function ListBody({ result }: ToolRenderProps) {
  const data = parse(listSchema, result?.data);
  if (!data) return null;
  if (!("server" in data)) return data.items.length
    ? <div className="flex flex-col gap-1.5">
      <PageNote shown={data.items.length} total={data.total} />
      <ul className="flex flex-col gap-1.5">{data.items.map((server, index) => <li key={index}><ServerLine server={toSummary(server)} /></li>)}</ul>
    </div>
    : <Empty text={messages.empty} />;
  return <div className="flex flex-col gap-2">
    <ServerLine server={toSummary(data.server)} />
    {!data.server.indexed ? <Empty text={messages.unindexedHint} />
      : data.items.length ? <>
        <PageNote shown={data.items.length} total={data.total} />
        <ToolList tools={data.items.map(tool => toTool(tool, false))} />
      </> : <Empty text={messages.noTools} />}
  </div>;
}

function SearchBody({ result }: ToolRenderProps) {
  const i18n = useI18n(), data = parse(searchSchema, result?.data);
  if (!data) return null;
  const { items, total } = data.matches;
  return <div className="flex flex-col gap-2">
    {items.length ? <>
      <PageNote shown={items.length} total={total} />
      <ToolList tools={items.map(tool => toTool(tool, true))} />
    </> : <Empty text={messages.noMatches} />}
    {data.unindexed_servers.length > 0 && <p className="type-caption text-muted-foreground">
      {i18n.formatMessage(messages.unindexedServers, { names: data.unindexed_servers.map(server => server.name).join(", ") })}
    </p>}
  </div>;
}

function InspectBody({ result }: ToolRenderProps) {
  const i18n = useI18n(), data = parse(inspectSchema, result?.data);
  if (!data) return null;
  const params = Object.entries(data.inputSchema?.properties ?? {});
  const required = data.inputSchema?.required ?? [];
  return <div className="flex flex-col gap-3 select-text">
    {data.description && <p className="type-caption whitespace-pre-wrap break-words">{data.description}</p>}
    <div className="flex flex-col gap-1.5">
      <p className="type-label">{i18n.text(messages.parameters)}</p>
      {params.length ? <ul className="flex flex-col gap-2">
        {params.map(([name, param]) => {
          const type = parameterType(param.type);
          return <li key={name} className="flex min-w-0 flex-col gap-0.5">
            <span className="type-code flex items-baseline gap-1 text-xs">
              <span>{name}</span>
              {type && <span className="text-muted-foreground">{type}</span>}
              {required.includes(name) && <span className="text-muted-foreground">*</span>}
            </span>
            {param.description && <span className="type-caption line-clamp-2 text-muted-foreground" title={param.description}>{param.description}</span>}
          </li>;
        })}
      </ul> : <Empty text={messages.noParameters} />}
    </div>
    {data.server_instructions && <Instructions text={data.server_instructions} />}
  </div>;
}

function ConnectBody({ result }: ToolRenderProps) {
  const data = parse(serverSchema, result?.data);
  return data ? <ServerLine server={toSummary(data)} /> : null;
}

// --- 调用正文：参数、进度与远端返回的内容 ---

function Section({ label, children }: { label: UiText; children: ReactNode }) {
  return <section className="min-w-0 space-y-1 text-xs leading-relaxed">
    <h4 className="type-caption">{useI18n().text(label)}</h4>
    {children}
  </section>;
}
const codeBlock = "type-code m-0 max-h-96 overflow-auto whitespace-pre-wrap break-all";

/** 参数来自调用本身；结果按部件顺序展示文字与文件，结构化输出只在文字中没有相同 JSON 时追加。 */
function CallBody({ args, phase, result }: ToolRenderProps<McpCallData>) {
  const i18n = useI18n(), object = useRendererObject();
  if (phase === "input") return null;
  const data = result?.data, settled = phase === "settled";
  const callArguments = inputField(args, "arguments");
  const progress = !settled ? data?.progress?.message : undefined;
  const extra = settled && data ? extraStructured(data) : null;
  return <div className="flex flex-col gap-3">
    {data && <p className="type-caption min-w-0 break-all text-muted-foreground">{data.serverName} · <span className="type-code">{data.toolName}</span></p>}
    {callArguments !== undefined && <Section label={messages.arguments}>
      <pre className={codeBlock}>{JSON.stringify(callArguments, null, 2)}</pre>
    </Section>}
    {progress && <p className="type-caption text-muted-foreground">{progress}</p>}
    {settled && data && <Section label={messages.output}>
      {data.parts.length || extra ? <div className="flex flex-col gap-2">
        {data.parts.map((part, index) => part.kind === "text"
          ? <pre key={index} className={codeBlock}>{displayText(part.text)}</pre>
          : <FilePreview key={index} part={part} content={object.content} />)}
      </div> : <p className="type-caption text-muted-foreground">{i18n.text(messages.noContent)}</p>}
    </Section>}
    {extra && <Section label={messages.structured}><pre className={codeBlock}>{JSON.stringify(extra.value, null, 2)}</pre></Section>}
  </div>;
}

const callView = { headerRenderer: CallHeader, bodyRenderer: CallBody };

export const mcpToolRenderers = [
  toolRenderer(McpList, { label: messages.list, icon: <ListTree className="size-3.5" />, ...settledBodyViews(ListHeader, ListBody) }),
  toolRenderer(McpSearch, { label: messages.search, icon: <Search className="size-3.5" />, ...settledBodyViews(SearchHeader, SearchBody) }),
  toolRenderer(McpInspect, { label: messages.inspect, icon: <FileSearch className="size-3.5" />, ...settledBodyViews(InspectHeader, InspectBody) }),
  toolRenderer(McpConnect, { label: messages.connectTool, icon: <Plug className="size-3.5" />, ...settledBodyViews(ConnectHeader, ConnectBody) }),
  toolRenderer(McpCall, { label: messages.call, icon: <Zap className="size-3.5" />, input: { headerRenderer: CallHeader }, execution: callView, result: callView }),
];
