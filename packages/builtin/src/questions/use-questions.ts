import { useCallback, useEffect, useRef, useState } from "react";
import { useRendererCalls, useRendererEvents } from "@atelier/sdk/renderer";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { AnswerQuestion, CancelQuestion, QuestionsChanged, ReadQuestions, type QuestionSnapshot, type Submission } from "./contract.ts";
import { questionDrafts } from "./drafts.ts";

/** 先订阅再读取；同一挂载串行重读，通知与查询交错时再读取一次。 */
export function useQuestions(object: ResourceRef) {
  const calls = useRendererCalls(), events = useRendererEvents();
  const [snapshot, setSnapshot] = useState<QuestionSnapshot>({ version: 0, pending: [] });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useRef<() => void>(() => {});
  const refresh = useCallback(() => retry.current(), []);
  const { id, sessionId, kind } = object;
  useEffect(() => {
    const controller = new AbortController();
    const ref = { id, sessionId, kind };
    let reading = false, dirty = false, ready = false;
    let latestVersion = -1;
    const read = async () => {
      dirty = true;
      if (!ready || reading || controller.signal.aborted) return;
      reading = true;
      try {
        while (dirty && !controller.signal.aborted) {
          dirty = false;
          const next = await calls.invoke(ReadQuestions, null, { object: ref, signal: controller.signal });
          if (!controller.signal.aborted && next.version >= latestVersion) {
            latestVersion = next.version;
            questionDrafts.reconcile(sessionId, id, next.version, next.pending.map(item => item.id));
            setSnapshot(next); setFailed(false);
          }
        }
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { reading = false; }
    };
    // 查询失败只重读；订阅断开才重建连接，已结束的连接不再提交查询结果。
    retry.current = () => { void read(); };
    const disconnected = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      setFailed(true);
      retry.current = () => setAttempt(value => value + 1);
    };
    const subscription = events.subscribe(QuestionsChanged, { delivery: "latest", signal: controller.signal }, event => {
      if (event.data.agentId === id && event.data.sessionId === sessionId) {
        latestVersion = Math.max(latestVersion, event.data.version);
        void read();
      }
    });
    void subscription.ready.then(() => {
      if (controller.signal.aborted) return;
      ready = true; return read();
    }).catch(disconnected);
    void subscription.closed.then(disconnected);
    return () => { controller.abort(); retry.current = () => {}; };
  }, [calls, events, id, sessionId, kind, attempt]);
  return {
    pending: snapshot.pending, failed, refresh,
    async answer(interactionId: string, submission: Submission) {
      await calls.invoke(AnswerQuestion, { id: interactionId, submission }, { object: { id, sessionId, kind } });
      refresh();
    },
    async cancel(interactionId: string) {
      await calls.invoke(CancelQuestion, { id: interactionId }, { object: { id, sessionId, kind } });
      refresh();
    },
  };
}
