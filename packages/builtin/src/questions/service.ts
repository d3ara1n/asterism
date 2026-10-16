import { randomUUID } from "node:crypto";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import type { Answer, PendingQuestion, QuestionSnapshot } from "./contract.ts";

interface Waiting {
  object: ResourceRef;
  pending: PendingQuestion;
  finish(result: CallResult<Answer>): void;
}
const same = (a: ResourceRef, b: ResourceRef) => a.id === b.id && a.sessionId === b.sessionId && a.kind === b.kind;

/** 服务只持有本次运行的交互；模型消息与已完成答案由既有工具历史保存。 */
export function createQuestionService(changed: (object: ResourceRef, version: number) => void) {
  const waiting = new Map<string, Waiting>();
  let version = 0;
  const notify = (ref: ResourceRef) => changed(ref, ++version);
  const lookup = (object: ResourceRef, id: string) => {
    const entry = waiting.get(id);
    if (!entry || !same(entry.object, object)) throw new PluginApiError("conflict", "This question is no longer awaiting an answer.");
    return entry;
  };
  return {
    read(object: ResourceRef): QuestionSnapshot {
      return { version, pending: [...waiting.values()].filter(entry => same(entry.object, object)).map(entry => structuredClone(entry.pending)) };
    },
    ask(object: ResourceRef, callId: string, question: string, signal: AbortSignal): Promise<CallResult<Answer>> {
      signal.throwIfAborted();
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const finish = (result: CallResult<Answer>) => {
          if (!waiting.delete(id)) return;
          signal.removeEventListener("abort", abort);
          try { notify(object); resolve(result); }
          catch (error) { reject(error); }
        };
        const abort = () => finish({ kind: "cancelled", message: "The question was cancelled." });
        waiting.set(id, { object: Object.freeze({ ...object }), pending: { id, callId, question }, finish });
        signal.addEventListener("abort", abort, { once: true });
        try { notify(object); }
        catch (error) { waiting.delete(id); signal.removeEventListener("abort", abort); reject(error); }
      });
    },
    answer(object: ResourceRef, id: string, answer: string) {
      lookup(object, id).finish({ kind: "succeeded", data: { answer } });
    },
    cancel(object: ResourceRef, id: string) {
      lookup(object, id).finish({ kind: "cancelled", message: "The user cancelled this question. Do not repeat it without a new reason." });
    },
  };
}
