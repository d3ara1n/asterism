import { Info, TriangleAlert } from "lucide-react";
import type { TimelineItem } from "./timeline";
import { timelineKey } from "./timeline";
import { s } from "../../../renderer/shared/i18n";
import { Badge } from "../../../renderer/shared/ui/badge";
import { Alert, AlertDescription } from "../../../renderer/shared/ui/alert";
import { Markdown } from "./Markdown";
import { ToolCall } from "./ToolCall";
import { ThinkingBlock } from "./ThinkingBlock";

export function ConversationTimeline({ items }: { items: readonly TimelineItem[] }) {
  return <>{items.map(node => <NodeView key={timelineKey(node)} node={node} />)}</>;
}

function NodeView({ node }: { node: TimelineItem }) {
  const usage = "usage" in node ? node.usage : node.kind === "notice" ? node.response?.usage : null;
  return <div className="flex flex-col gap-1">
    <NodeContent node={node} />
    {usage && <p className="type-caption">
      {s("Input", "输入")} {usage.input ?? "—"} · {s("Output", "输出")} {usage.output ?? "—"} · {s("Cached", "缓存读取")} {usage.cacheRead ?? "—"}
    </p>}
  </div>;
}
function NodeContent({ node }: { node: TimelineItem }) {
  const incomplete = "complete" in node && !node.complete;
  const streaming = (node.kind === "text" || node.kind === "thinking") && !("complete" in node);
  const tag = incomplete ? <Badge variant="outline">{s("Incomplete", "未完成")}</Badge> : null;
  switch (node.kind) {
    case "message": return <article className="space-y-2"><p className="type-label">{s("You", "你")}</p>
      <div className="rounded-md bg-muted px-3 py-2"><Markdown>{node.text}</Markdown></div></article>;
    case "text": return <article className="space-y-1">{tag}<Markdown streaming={streaming}>{node.text}</Markdown></article>;
    case "thinking": return node.text.trim() ? <ThinkingBlock node={node} /> : null;
    case "toolcall": return <ToolCall node={node} />;
    case "notice": return <Alert variant={node.level === "error" ? "destructive" : "default"}>
      {node.level === "error" ? <TriangleAlert /> : <Info />}<AlertDescription>{node.message}</AlertDescription></Alert>;
    default: return null;
  }
}
