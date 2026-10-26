import { useI18n, useRendererConfig } from "@asterism/sdk/renderer";
import { Brain } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { Badge } from "@asterism/ui/ui/badge";
import { Spinner } from "@asterism/ui/ui/spinner";
import { StreamingPreview } from "@asterism/ui/streaming-preview";
import { thinkingMessages } from "../../messages/thinking";
import { BuiltinSettings } from "../../settings/contract";
import { Disclosure } from "./Disclosure";
import { Markdown } from "./Markdown";
import { thinkingDuration } from "./thinking-state";
import { useStreamingDisclosure } from "../../shared/use-streaming-disclosure";
import { generating, type TimelineItem } from "./timeline";
import { viewStateKeys } from "./view-state";

type ThinkingNode = Extract<TimelineItem, { kind: "thinking" }>;

/** 外壳的开合偏好与正文的过程/终结渲染相互独立。 */
export function ThinkingBlock({ node }: { node: ThinkingNode }) {
  const streaming = generating(node);
  const preferences = useRendererConfig(BuiltinSettings);
  const disclosure = useStreamingDisclosure(viewStateKeys.disclosure, streaming ? "thinking" : null, node.text.length > 0, preferences);
  // 实时块与成型块都携带生成起止；历史未记录时间时不补造耗时。
  const startedAt = node.startedAt ?? null;
  const endedAt = node.endedAt ?? null;
  const interrupted = "complete" in node && !node.complete;

  return <Disclosure {...disclosure}
    header={<ThinkingHeader streaming={streaming} startedAt={startedAt} endedAt={endedAt} interrupted={interrupted} />}>
    <ThinkingBody streaming={streaming} text={node.text} />
  </Disclosure>;
}

/** 计时刷新局限于 header，不让 Markdown 每秒重新渲染。 */
function ThinkingHeader({ streaming, startedAt, endedAt, interrupted }: {
  streaming: boolean; startedAt: number | null; endedAt: number | null; interrupted: boolean;
}) {
  const i18n = useI18n();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!streaming || startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [streaming, startedAt]);
  // 只有生成中的块以当前时间计时；未结束就中断的成型块不推算用时。
  const end = endedAt ?? (streaming ? now : null);
  const duration = end === null ? null : thinkingDuration(startedAt, end);
  return <>
    <span className="inline-flex shrink-0" aria-hidden="true">
      {streaming ? <Spinner className="size-3.5 motion-reduce:animate-none" /> : <Brain className="size-3.5" />}
    </span>
    <span className="min-w-0 flex-1 truncate text-left">{streaming ? i18n.formatMessage(thinkingMessages.thinkingActive) : i18n.formatMessage(thinkingMessages.thinkingTitle)}</span>
    {duration && <span role="timer" aria-live="off" aria-label={i18n.formatMessage(thinkingMessages.thinkingElapsed, { duration: duration })} className="shrink-0 whitespace-nowrap type-caption tabular-nums">{duration}</span>}
    {interrupted && <Badge variant="outline">{i18n.formatMessage(thinkingMessages.thinkingInterrupted)}</Badge>}
  </>;
}

const ThinkingBody = memo(function ThinkingBody({ streaming, text }: { streaming: boolean; text: string }) {
  return streaming
    ? <StreamingPreview><Markdown streaming>{text}</Markdown></StreamingPreview>
    : <Markdown>{text}</Markdown>;
});
