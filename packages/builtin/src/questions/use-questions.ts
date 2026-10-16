import { useCallback, useEffect, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@atelier/sdk/renderer";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { AnswerQuestion, CancelQuestion, QuestionsChanged, ReadQuestions, type QuestionSnapshot } from "./contract.ts";

/** 先订阅再读取；同一挂载串行重读，通知与查询交错时再读取一次。 */
export function useQuestions(object: ResourceRef) {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [snapshot, setSnapshot] = useState<QuestionSnapshot>({ version: 0, pending: [] });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  const { id, sessionId, kind } = object;
  useEffect(() => {
    const controller = new AbortController();
    const ref = { id, sessionId, kind };
    let reading = false, dirty = false, ready = false;
    const read = async () => {
      dirty = true;
      if (!ready || reading || controller.signal.aborted) return;
      reading = true;
      try {
        while (dirty && !controller.signal.aborted) {
          dirty = false;
          const next = await calls.invoke(ReadQuestions, null, { object: ref, signal: controller.signal });
          if (!controller.signal.aborted) { setSnapshot(next); setFailed(false); }
        }
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { reading = false; }
    };
    const subscription = events.subscribe(QuestionsChanged, { delivery: "latest", signal: controller.signal }, event => {
      if (event.data.agentId === id && event.data.sessionId === sessionId) void read();
    });
    void subscription.ready.then(() => { ready = true; return read(); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    void subscription.closed.then(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [calls, events, id, sessionId, kind, attempt]);
  return {
    pending: snapshot.pending, failed, refresh,
    async answer(interactionId: string, answer: string) {
      await calls.invoke(AnswerQuestion, { id: interactionId, answer }, { object: { id, sessionId, kind } });
      refresh();
    },
    async cancel(interactionId: string) {
      await calls.invoke(CancelQuestion, { id: interactionId }, { object: { id, sessionId, kind } });
      refresh();
    },
  };
}
