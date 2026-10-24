import type { ReactNode } from "react";
import { Globe, Search, Download } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { webResponseSchema, type Json, type WebDocument, type WebResponse } from "@atelier/sdk/contracts";
import { ToolHeader } from "@atelier/ui/tool-header";
import { WebResource, CreateWeb, WebView, WebSearch, WebFetch } from "./contract";
import { webMessages as messages } from "../messages/web";
import { Markdown } from "../agent/conversation/Markdown";

const appearance = { width: 340, height: 220, minWidth: 260, minHeight: 140 };
const field = (value: Json, key: string) => value && typeof value === "object" && !Array.isArray(value) && typeof value[key] === "string" ? value[key] : undefined;
const parseResponse = (data: Json | undefined) => { const parsed = webResponseSchema.safeParse(data); return parsed.success ? parsed.data : undefined; };

/** 来源信息行：域名 · 作者 · 日期；日期只取日历部分。 */
function sourceLine(document: WebDocument) {
  return [new URL(document.url).hostname, document.author, ...document.dates?.map(date => date.value.slice(0, 10)) ?? []].filter(Boolean).join(" · ");
}
function ResponseFrame({ data, children }: { data: WebResponse; children: ReactNode }) {
  const i18n = useI18n();
  return <div className="flex flex-col gap-3 select-text">
    {data.hints.map((hint, index) => <p key={index} className="type-caption text-muted-foreground">{hint.message}</p>)}
    {data.documents.length ? children : <p className="type-caption text-muted-foreground">{i18n.text(messages.noResults)}</p>}
  </div>;
}

/** 搜索结果供审阅来源：每条只显示标题、来源与首段内容的两行预览，完整内容留在结果详情。 */
function SearchBody({ result }: ToolRenderProps) {
  const data = parseResponse(result?.data);
  if (!data) return null;
  return <ResponseFrame data={data}>
    <ol className="flex flex-col gap-2.5">
      {data.documents.map((document, index) => {
        const preview = document.content[0]?.text.replace(/\s+/gu, " ").trim();
        return <li key={index} className="flex min-w-0 flex-col gap-0.5">
          <a href={document.url} target="_blank" rel="noopener noreferrer" title={document.url}
            className="type-label truncate text-primary-text hover:underline">{document.title || document.url}</a>
          <p className="type-caption truncate text-muted-foreground">{sourceLine(document)}</p>
          {preview && <p className="type-caption line-clamp-2 text-muted-foreground" title={preview}>{preview}</p>}
        </li>;
      })}
    </ol>
  </ResponseFrame>;
}

/** 获取结果是指定页面：标题与来源之下，正文在局部滚动区内完整阅读，截断说明放在正文之外。 */
function FetchBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  const data = parseResponse(result?.data);
  if (!data) return null;
  return <ResponseFrame data={data}>
    {data.documents.map((document, index) => {
      const part = document.content.find(item => item.kind === "body") ?? document.content[0];
      return <article key={index} className="flex min-w-0 flex-col gap-1.5">
        <a href={document.url} target="_blank" rel="noopener noreferrer" title={document.url}
          className="type-label break-words text-primary-text hover:underline">{document.title || document.url}</a>
        <p className="type-caption truncate text-muted-foreground">{sourceLine(document)}</p>
        {part && <div className="max-h-96 overflow-auto rounded-md border px-3 py-2">
          {part.format === "markdown" ? <Markdown>{part.text}</Markdown> : <p className="type-body whitespace-pre-wrap break-words">{part.text}</p>}
        </div>}
        {part?.truncated && <p className="type-caption text-muted-foreground">{i18n.text(messages.truncated)}</p>}
      </article>;
    })}
  </ResponseFrame>;
}
function SearchHeader({ args, result }: ToolRenderProps) {
  const i18n = useI18n(), data = parseResponse(result?.data);
  return <ToolHeader label={i18n.text(messages.search)} subject={field(args, "query")}
    meta={data && i18n.formatMessage(messages.results, { count: data.documents.length })} />;
}
function FetchHeader({ args }: ToolRenderProps) {
  return <ToolHeader label={useI18n().text(messages.fetch)} subject={field(args, "url")} />;
}
/** 结果到达前没有正文；以组件形式传入，避免执行中回落到 DefaultToolBody 的“没有输出”。 */
const noBody = () => null;
export default {
  resources: [{ kind: WebResource.kind, label: messages.title, icon: <Globe className="size-4" />, card: appearance }],
  cards: [cardRenderer(WebView, { ...appearance, Body: ({ data }) => {
    const i18n = useI18n();
    return <div className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
      {!data.types.length && <p className="type-caption text-muted-foreground">{i18n.text(messages.empty)}</p>}
      {data.types.map(type => (
        <div key={type.id} className="flex items-center justify-between gap-2">
          <span className="type-body truncate">{i18n.text(type.label)}</span>
          <span className="type-caption text-muted-foreground">{!type.enabled ? i18n.text(messages.disabled)
            : [type.search && i18n.text(messages.search), type.fetch && i18n.text(messages.fetch)].filter(Boolean).join(" · ")}</span>
        </div>
      ))}
    </div>;
  } })],
  tools: [
    toolRenderer(WebSearch, { label: messages.search, icon: <Search className="size-3.5" />, input: { headerRenderer: SearchHeader },
      execution: { headerRenderer: SearchHeader, bodyRenderer: noBody }, result: { headerRenderer: SearchHeader, bodyRenderer: SearchBody } }),
    toolRenderer(WebFetch, { label: messages.fetch, icon: <Download className="size-3.5" />, input: { headerRenderer: FetchHeader },
      execution: { headerRenderer: FetchHeader, bodyRenderer: noBody }, result: { headerRenderer: FetchHeader, bodyRenderer: FetchBody } }),
  ],
  creations: [creationEntry(CreateWeb, { id: "atelier.builtin/web.blank", label: messages.title, icon: <Globe className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "Web" } } } })],
} satisfies RendererModule;
