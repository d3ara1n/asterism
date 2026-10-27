import { randomUUID } from "node:crypto";
import type { ResourceRef } from "@asterism/sdk/contracts";
import { PluginApiError, type CallResult } from "@asterism/sdk/runtime";
import type { Answer, PendingQuestion, Question, Submission } from "./contract.ts";
import { AnswerValidationError, resolveAnswers } from "./answers.ts";

interface Waiting {
  object: ResourceRef;
  pending: PendingQuestion;
  finish(result: CallResult<Answer>): void;
}
const same = (a: ResourceRef, b: ResourceRef) => a.id === b.id && a.sessionId === b.sessionId && a.kind === b.kind;

/** The service holds only interactions from the current run; existing tool history stores model messages and completed answers. */
export function createQuestionService(changed: (object: ResourceRef, pending: PendingQuestion[]) => void) {
  const waiting = new Map<string, Waiting>();
  const current = (ref: ResourceRef) => [...waiting.values()].filter(entry => same(entry.object, ref)).map(entry => structuredClone(entry.pending));
  const notify = (ref: ResourceRef) => changed(ref, current(ref));
  const lookup = (object: ResourceRef, id: string) => {
    const entry = waiting.get(id);
    if (!entry || !same(entry.object, object)) throw new PluginApiError("conflict", "This question is no longer awaiting an answer.");
    return entry;
  };
  return {
    read(object: ResourceRef): { pending: PendingQuestion[] } {
      return { pending: current(object) };
    },
    ask(object: ResourceRef, callId: string, questions: Question[], signal: AbortSignal, publish?: (id: string) => void): Promise<CallResult<Answer>> {
      signal.throwIfAborted();
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const finish = (result: CallResult<Answer>) => {
          if (!waiting.delete(id)) return;
          signal.removeEventListener("abort", abort);
          // The answer or cancellation has been accepted; notification failure does not change the tool outcome. Tool history finalizes the UI, and notifications only clean up drafts.
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
      lookup(object, id).finish({ kind: "cancelled", data: null, message: "The user cancelled this question group." });
    },
  };
}
