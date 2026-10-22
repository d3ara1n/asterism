import { useI18n, useRendererConfig } from "@atelier/sdk/renderer";
import { Brain } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { Badge } from "@atelier/ui/ui/badge";
import { Spinner } from "@atelier/ui/ui/spinner";
import { StreamingPreview } from "@atelier/ui/streaming-preview";
import { thinkingMessages } from "../../messages/thinking";
import { BuiltinSettings } from "../../settings/contract";
import { Disclosure } from "./Disclosure";
import { Markdown } from "./Markdown";
import { advanceThinkingDisclosure, initialThinkingDisclosure, thinkingDuration } from "./thinking-state";
import type { TimelineItem } from "./timeline";

type ThinkingNode = Extract<TimelineItem, { kind: "thinking" }>;

/** 外壳的开合偏好与正文的过程/终结渲染相互独立。 */
export function ThinkingBlock({ node }: { node: ThinkingNode }) {
  const streaming = "endedAt" in node && node.endedAt === null;
  const preferences = useRendererConfig(BuiltinSettings);
  const [disclosure, setDisclosure] = useState(() => initialThinkingDisclosure(streaming, preferences));
  const next = advanceThinkingDisclosure(disclosure, streaming, preferences);
  if (next !== disclosure) setDisclosure(next);
  // 同一块落库保留本次实时计时；历史没有保存起点时不补造耗时。
  const [startedAt] = useState(() => "startedAt" in node ? node.startedAt : null);
  const finished = "endedAt" in node ? node.endedAt : Date.parse(node.createdAt);
  const [endedAt, setEndedAt] = useState(finished);
  if (endedAt === null && finished !== null) setEndedAt(finished);
  const interrupted = "complete" in node && !node.complete;

  return <Disclosure open={next.open} onOpenChange={open => setDisclosure({ streaming, open })}
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
  const duration = thinkingDuration(startedAt, endedAt ?? now);
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
