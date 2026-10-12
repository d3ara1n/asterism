import { useI18n } from "@atelier/sdk/renderer";
import { TriangleAlert, Info } from "lucide-react";

import { Alert, AlertDescription } from "../../../renderer/shared/ui/alert";
import { Badge } from "../../../renderer/shared/ui/badge";
import { conversationMessages } from "../../messages/conversation";
import { Markdown } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { timelineKey, type TimelineItem } from "./timeline";
import { ToolCall } from "./ToolCall";

export function ConversationTimeline({ items }: { items: readonly TimelineItem[] }) {

  return <>{items.map(node => <NodeView key={timelineKey(node)} node={node} />)}</>;
}

function NodeView({ node }: { node: TimelineItem }) {
  const i18n = useI18n();
  const usage = "usage" in node ? node.usage : node.kind === "notice" ? node.response?.usage : null;
  return <div className="flex flex-col gap-1">
    <NodeContent node={node} />
    {usage && <p className="type-caption">
      {i18n.formatMessage(conversationMessages.inputTokens)} {usage.input ?? "—"} · {i18n.formatMessage(conversationMessages.outputTokens)} {usage.output ?? "—"} · {i18n.formatMessage(conversationMessages.cachedTokens)} {usage.cacheRead ?? "—"}
    </p>}
  </div>;
}
function NodeContent({ node }: { node: TimelineItem }) {
  const i18n = useI18n();
  const incomplete = "complete" in node && !node.complete;
  const streaming = (node.kind === "text" || node.kind === "thinking") && !("complete" in node);
  const tag = incomplete ? <Badge variant="outline">{i18n.formatMessage(conversationMessages.incomplete)}</Badge> : null;
  switch (node.kind) {
    case "message": return <article className="space-y-2"><p className="type-label">{i18n.formatMessage(conversationMessages.you)}</p>
      <div className="rounded-md bg-muted px-3 py-2"><Markdown>{node.text}</Markdown></div></article>;
    case "text": return <article className="space-y-1">{tag}<Markdown streaming={streaming}>{node.text}</Markdown></article>;
    case "thinking": return node.text.trim() ? <ThinkingBlock node={node} /> : null;
    case "toolcall": return <ToolCall node={node} />;
    case "notice": return <Alert variant={node.level === "error" ? "destructive" : "default"}>
      {node.level === "error" ? <TriangleAlert /> : <Info />}<AlertDescription>{node.message}</AlertDescription></Alert>;
    default: return null;
  }
}
