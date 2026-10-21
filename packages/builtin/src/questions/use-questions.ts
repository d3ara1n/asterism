import { useCallback, useEffect, useRef, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@atelier/sdk/renderer";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { AnswerQuestion, CancelQuestion, QuestionsChanged, ReadQuestions, type PendingQuestion, type Submission } from "./contract.ts";

/** 订阅直接交付当前问题；首次读取也经同一事件通道发送，普通变化不触发查询。 */
export function useQuestions(object: ResourceRef) {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [pending, setPending] = useState<PendingQuestion[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useRef<() => void>(() => {});
  const refresh = useCallback(() => retry.current(), []);
  const { id, sessionId, kind } = object;
  useEffect(() => {
    const controller = new AbortController();
    let reading = false;
    const read = async () => {
      if (reading || controller.signal.aborted) return;
      reading = true;
      try { await calls.invoke(ReadQuestions, null, { object: { id, sessionId, kind }, signal: controller.signal }); }
      catch { if (!controller.signal.aborted) setFailed(true); }
      finally { reading = false; }
    };
    const disconnected = () => {
      if (controller.signal.aborted) return;
      controller.abort(); setFailed(true);
      retry.current = () => setAttempt(value => value + 1);
    };
    const subscription = events.subscribe(QuestionsChanged, { delivery: "latest", signal: controller.signal }, event => {
      if (!controller.signal.aborted && event.data.agentId === id && event.data.sessionId === sessionId) {
        setPending(event.data.pending); setFailed(false);
      }
    });
    void subscription.ready.then(() => { retry.current = () => { void read(); }; return read(); }).catch(disconnected);
    void subscription.closed.then(disconnected);
    return () => { controller.abort(); retry.current = () => {}; };
  }, [calls, events, id, sessionId, kind, attempt]);
  return {
    pending, failed, refresh,
    async answer(interactionId: string, submission: Submission) {
      await calls.invoke(AnswerQuestion, { id: interactionId, submission }, { object: { id, sessionId, kind } });
    },
    async cancel(interactionId: string) {
      await calls.invoke(CancelQuestion, { id: interactionId }, { object: { id, sessionId, kind } });
    },
  };
}
