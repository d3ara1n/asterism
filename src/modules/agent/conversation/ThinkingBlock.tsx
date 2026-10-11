import { memo, useEffect, useState } from "react";
import { Brain } from "lucide-react";
import type { TimelineItem } from "./timeline";
import { useRendererObject } from "@atelier/sdk/renderer";
import { ThinkingPreferences } from "../configuration";
import { t } from "../../../renderer/shared/i18n";
import { Badge } from "../../../renderer/shared/ui/badge";
import { Spinner } from "../../../renderer/shared/ui/spinner";
import { Markdown } from "./Markdown";
import { advanceThinkingDisclosure, initialThinkingDisclosure, thinkingDuration } from "./thinking-state";
import { Disclosure } from "./Disclosure";

type ThinkingNode = Extract<TimelineItem, { kind: "thinking" }>;

/** 外壳的开合偏好与正文的过程/终结渲染相互独立。 */
export function ThinkingBlock({ node }: { node: ThinkingNode }) {
  const streaming = !("complete" in node);
  const preferences = useRendererObject().catalogs.get(ThinkingPreferences) ?? { thinkingAutoExpand: true, thinkingAutoCollapse: true };
  const [disclosure, setDisclosure] = useState(() => initialThinkingDisclosure(streaming, preferences));
  const next = advanceThinkingDisclosure(disclosure, streaming, preferences);
  if (next !== disclosure) setDisclosure(next);
  // 同一块落库保留本次实时计时；历史没有保存起点时不补造耗时。
  const [startedAt] = useState(() => "startedAt" in node ? node.startedAt : null);
  const endedAt = "createdAt" in node ? Date.parse(node.createdAt) : null;
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
    <span className="min-w-0 flex-1 truncate text-left">{streaming ? t.thinkingActive : t.thinkingTitle}</span>
    {duration && <span role="timer" aria-live="off" aria-label={t.thinkingElapsed(duration)} className="shrink-0 whitespace-nowrap type-caption tabular-nums">{duration}</span>}
    {interrupted && <Badge variant="outline">{t.thinkingInterrupted}</Badge>}
  </>;
}

const ThinkingBody = memo(function ThinkingBody({ streaming, text }: { streaming: boolean; text: string }) {
  return streaming
    ? <div className="thinking-preview" inert aria-hidden="true">
      <div className="min-w-0 shrink-0"><Markdown streaming>{text}</Markdown></div>
    </div>
    : <Markdown>{text}</Markdown>;
});
