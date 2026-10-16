import { randomUUID } from "node:crypto";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import type { Answer, PendingQuestion, Question, QuestionSnapshot, Submission } from "./contract.ts";
import { AnswerValidationError, resolveAnswers } from "./answers.ts";

interface Waiting {
  object: ResourceRef;
  pending: PendingQuestion;
  finish(result: CallResult<Answer>): void;
}
const same = (a: ResourceRef, b: ResourceRef) => a.id === b.id && a.sessionId === b.sessionId && a.kind === b.kind;

/** 服务只持有本次运行的交互；模型消息与已完成答案由既有工具历史保存。 */
export function createQuestionService(changed: (object: ResourceRef, version: number, pendingIds: string[]) => void) {
  const waiting = new Map<string, Waiting>();
  let version = 0;
  const notify = (ref: ResourceRef) => changed(ref, ++version,
    [...waiting.values()].filter(entry => same(entry.object, ref)).map(entry => entry.pending.id));
  const lookup = (object: ResourceRef, id: string) => {
    const entry = waiting.get(id);
    if (!entry || !same(entry.object, object)) throw new PluginApiError("conflict", "This question is no longer awaiting an answer.");
    return entry;
  };
  return {
    read(object: ResourceRef): QuestionSnapshot {
      return { version, pending: [...waiting.values()].filter(entry => same(entry.object, object)).map(entry => structuredClone(entry.pending)) };
    },
    ask(object: ResourceRef, callId: string, questions: Question[], signal: AbortSignal, publish?: (id: string) => void): Promise<CallResult<Answer>> {
      signal.throwIfAborted();
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const finish = (result: CallResult<Answer>) => {
          if (!waiting.delete(id)) return;
          signal.removeEventListener("abort", abort);
          // 答案或取消已被受理；通知失败不改变工具结局，界面可通过快照重读同步。
          resolve(result);
          try { notify(object); }
          catch (error) { console.error("Question state notification failed after settlement.", error); }
        };
        const abort = () => finish({ kind: "cancelled", data: null, message: "The question was cancelled." });
        waiting.set(id, { object: Object.freeze({ ...object }), pending: { id, callId, questions: structuredClone(questions) }, finish });
        signal.addEventListener("abort", abort, { once: true });
        try { publish?.(id); notify(object); }
        catch (error) { waiting.delete(id); signal.removeEventListener("abort", abort); reject(error); }
      });
    },
    answer(object: ResourceRef, id: string, submission: Submission) {
      const entry = lookup(object, id);
      let data;
      try { data = resolveAnswers(entry.pending.questions, submission); }
      catch (error) {
        if (error instanceof AnswerValidationError) throw new PluginApiError("invalid_argument", error.message);
        throw error;
      }
      entry.finish({ kind: "succeeded", data });
    },
    cancel(object: ResourceRef, id: string) {
      lookup(object, id).finish({ kind: "cancelled", data: null, message: "The user cancelled these questions. No draft answers were submitted. This is not consent. Do not repeat them without a new reason." });
    },
  };
}
