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

/** Shell expansion preferences are independent of the body's in-progress/final rendering. */
export function ThinkingBlock({ node }: { node: ThinkingNode }) {
  const streaming = generating(node);
  const preferences = useRendererConfig(BuiltinSettings);
  const disclosure = useStreamingDisclosure(viewStateKeys.disclosure, streaming ? "thinking" : null, node.text.length > 0, preferences);
  // Both live and formed blocks carry generation start and end times; no duration is fabricated when history has no timing.
  const startedAt = node.startedAt ?? null;
  const endedAt = node.endedAt ?? null;
  const interrupted = "complete" in node && !node.complete;

  return <Disclosure {...disclosure}
    header={<ThinkingHeader streaming={streaming} startedAt={startedAt} endedAt={endedAt} interrupted={interrupted} />}>
    <ThinkingBody streaming={streaming} text={node.text} />
  </Disclosure>;
}

/** Timing refreshes are confined to the header so Markdown does not rerender every second. */
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
  // Only generating blocks use the current time for timing; formed blocks interrupted before completion do not infer elapsed time.
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
