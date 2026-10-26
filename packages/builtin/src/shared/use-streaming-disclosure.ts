import { useEffect, useReducer } from "react";
import { useRendererViewState } from "@asterism/sdk/renderer";
import {
  advanceStreamingDisclosure, changeStreamingDisclosure, initialStreamingDisclosure,
  type StreamingPreferences, type StreamingStage,
} from "./streaming-disclosure.ts";

/** 开合与等待起点随条目保留；定时器只属于当前挂载的视图。 */
export function useStreamingDisclosure(
  key: string, stage: StreamingStage, hasContent: boolean, preferences: StreamingPreferences, attention = false,
) {
  const [state, setState] = useRendererViewState(key, initialStreamingDisclosure);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const next = advanceStreamingDisclosure(state, stage, hasContent, preferences, Date.now(), attention);
  if (next !== state) setState(next);
  const expandAt = next.expandAt;
  useEffect(() => {
    if (expandAt === null) return;
    const timer = window.setTimeout(refresh, Math.max(0, expandAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expandAt]);
  return { open: next.open, onOpenChange: (open: boolean) => setState(changeStreamingDisclosure(next, open)) };
}
