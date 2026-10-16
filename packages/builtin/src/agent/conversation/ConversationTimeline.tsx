import { useI18n, useRendererObject } from "@atelier/sdk/renderer";
import { TriangleAlert, Info } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { Badge } from "@atelier/ui/ui/badge";
import { formatCount } from "@atelier/ui/format-count";
import { conversationMessages } from "../../messages/conversation";
import { Markdown } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { timelineKey, type TimelineItem } from "./timeline";
import { ToolCall } from "./ToolCall";
import { FilePreview } from "./Files";
import { Disclosure } from "./Disclosure";

export function ConversationTimeline({ items }: { items: readonly TimelineItem[] }) {

  return <>{items.map(node => <NodeView key={timelineKey(node)} node={node} />)}</>;
}

function NodeView({ node }: { node: TimelineItem }) {
  const i18n = useI18n();
  const usage = "usage" in node ? node.usage : node.kind === "notice" ? node.response?.usage : null;
  const count = (value: number | null | undefined) => value == null ? "—" : formatCount(value);
  return <div className="flex flex-col gap-1">
    <NodeContent node={node} />
    {usage && <p className="type-caption">
      {i18n.formatMessage(conversationMessages.inputTokens)} {count(usage.input)} · {i18n.formatMessage(conversationMessages.outputTokens)} {count(usage.output)} · {i18n.formatMessage(conversationMessages.cachedTokens)} {count(usage.cacheRead)}
    </p>}
  </div>;
}
function NodeContent({ node }: { node: TimelineItem }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const incomplete = "complete" in node && !node.complete;
  const streaming = (node.kind === "text" || node.kind === "thinking") && "endedAt" in node && node.endedAt === null;
  const tag = incomplete ? <Badge variant="outline">{i18n.formatMessage(conversationMessages.incomplete)}</Badge> : null;
  switch (node.kind) {
    case "message": return <article className="space-y-2"><p className="type-label">{i18n.formatMessage(conversationMessages.you)}</p>
      <div className="space-y-2 rounded-md bg-muted px-3 py-2">{node.parts.map((part, index) =>
        part.kind === "text" ? <Markdown key={index}>{part.text}</Markdown>
          : <FilePreview key={index} part={part} content={object.content} />)}</div></article>;
    case "text": return <article className="space-y-1">{tag}<Markdown streaming={streaming}>{node.text}</Markdown></article>;
    case "thinking": return node.text.trim() ? <ThinkingBlock node={node} /> : null;
    case "toolcall": return <ToolCall node={node} />;
    case "summary": return <Summary text={node.text} />;
    case "notice": return <Alert variant={node.level === "error" ? "destructive" : "default"}>
      {node.level === "error" ? <TriangleAlert /> : <Info />}<AlertDescription>{node.message}</AlertDescription></Alert>;
    default: return null;
  }
}
function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const i18n = useI18n();
  return <Disclosure open={open} onOpenChange={setOpen} header={<><Info className="size-3.5" />
    <span className="min-w-0 flex-1 text-left">{i18n.formatMessage(conversationMessages.contextSummary)}</span></>}>
    <Markdown>{text}</Markdown>
  </Disclosure>;
}
