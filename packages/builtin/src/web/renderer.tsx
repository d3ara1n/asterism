import { Globe, Search, Download } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, useI18n, type RendererModule, type ToolRenderProps } from "@atelier/sdk/renderer";
import { webResponseSchema, type Json } from "@atelier/sdk/contracts";
import { ToolHeader } from "@atelier/ui/tool-header";
import { WebResource, CreateWeb, WebView, WebSearch, WebFetch } from "./contract";
import { webMessages as messages } from "../messages/web";
import { Markdown } from "../agent/conversation/Markdown";

const appearance = { width: 340, height: 220, minWidth: 260, minHeight: 140 };
const field = (value: Json, key: string) => value && typeof value === "object" && !Array.isArray(value) && typeof value[key] === "string" ? value[key] : undefined;
function ResultBody({ result }: ToolRenderProps) {
  const i18n = useI18n();
  const parsed = webResponseSchema.safeParse(result?.data);
  if (!parsed.success) return null;
  const data = parsed.data;
  return <div className="flex flex-col gap-3 select-text">
    {data.hints.map((hint, index) => <p key={index} className="type-caption text-muted-foreground">{hint.message}</p>)}
    {!data.documents.length && <p className="type-caption text-muted-foreground">{i18n.text(messages.noResults)}</p>}
    {data.documents.map((document, index) => <article key={index} className="flex min-w-0 flex-col gap-2">
      <a href={document.url} target="_blank" rel="noopener noreferrer" className="type-label break-words text-primary-text hover:underline">{document.title || document.url}</a>
      {(document.author || document.dates?.length) && <p className="type-caption text-muted-foreground">{[document.author, ...document.dates?.map(date => date.value) ?? []].filter(Boolean).join(" · ")}</p>}
      {document.content.map((part, partIndex) => <div key={partIndex} className="flex min-w-0 flex-col gap-1">
        <p className="type-caption text-muted-foreground">{i18n.text(messages[part.kind])}{part.truncated ? ` · ${i18n.text(messages.truncated)}` : ""}</p>
        {part.format === "markdown" ? <Markdown>{part.text}</Markdown> : <p className="type-body whitespace-pre-wrap break-words">{part.text}</p>}
      </div>)}
      {!!document.details?.length && <details className="type-caption"><summary className="cursor-pointer text-muted-foreground">{i18n.text(messages.details)}</summary>
        <pre className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(document.details, null, 2)}</pre></details>}
    </article>)}
  </div>;
}
function SearchHeader({ args, result }: ToolRenderProps) {
  const i18n = useI18n(), parsed = webResponseSchema.safeParse(result?.data);
  return <ToolHeader label={i18n.text(messages.search)} subject={field(args, "query")}
    meta={parsed.success ? i18n.formatMessage(messages.results, { count: parsed.data.documents.length }) : undefined} />;
}
function FetchHeader({ args }: ToolRenderProps) {
  return <ToolHeader label={useI18n().text(messages.fetch)} subject={field(args, "url")} />;
}
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
      execution: { headerRenderer: SearchHeader }, result: { headerRenderer: SearchHeader, bodyRenderer: ResultBody } }),
    toolRenderer(WebFetch, { label: messages.fetch, icon: <Download className="size-3.5" />, input: { headerRenderer: FetchHeader },
      execution: { headerRenderer: FetchHeader }, result: { headerRenderer: FetchHeader, bodyRenderer: ResultBody } }),
  ],
  creations: [creationEntry(CreateWeb, { id: "atelier.builtin/web.blank", label: messages.title, icon: <Globe className="size-4" />, group: "resources", triggers: { menu: { initialInput: { title: "Web" } } } })],
} satisfies RendererModule;
