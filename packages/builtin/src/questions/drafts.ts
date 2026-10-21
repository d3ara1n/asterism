import type { PendingQuestion, Question, Submission } from "./contract.ts";

export interface AnswerDraft {
  selected: string[];
  custom: boolean;
  text: string;
  skipped: boolean;
}
export interface QuestionDraft {
  answers: AnswerDraft[];
  page: number;
  message: string;
  messageOpen: boolean;
  detail: string | null;
}
export function emptyAnswer(): AnswerDraft {
  return { selected: [], custom: false, text: "", skipped: false };
}
export function draftSubmission(questions: Question[], draft: QuestionDraft): Submission {
  return {
    answers: questions.map((question, index) => {
      const answer = draft.answers[index]!;
      const selected = question.type === "single" && answer.custom ? [] : answer.selected;
      const usesText = question.type === "text" || answer.custom;
      const text = usesText ? answer.text.trim() : "";
      // 可选题留空直接跳过；主动勾选的自定义项仍须填写，不能静默丢弃选择。
      if (answer.skipped || (!question.required && !selected.length && !text && !answer.custom))
        return { id: question.id, status: "skipped" as const };
      return {
        id: question.id, status: "answered" as const,
        selected, ...(usesText ? { text } : {}),
      };
    }),
    ...(draft.message.trim() ? { message: draft.message.trim() } : {}),
  };
}
function createEntry(pending: PendingQuestion) {
  let value: QuestionDraft = {
    answers: pending.questions.map(emptyAnswer), page: 0, message: "", messageOpen: false, detail: null,
  };
  const listeners = new Set<() => void>();
  let operation = { busy: false, failed: false };
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => value,
    getOperationSnapshot: () => operation,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(next: QuestionDraft) {
      if (operation.busy) return;
      value = next; notify();
    },
    async perform(action: () => Promise<void>) {
      if (operation.busy) return;
      operation = { busy: true, failed: false }; notify();
      try { await action(); }
      catch { operation = { ...operation, failed: true }; }
      finally { operation = { ...operation, busy: false }; notify(); }
    },
  };
}
/** 草稿跟随提问身份而非挂载组件；已结束条目从索引移除，退场组件仍可读自己的旧句柄。 */
export function createQuestionDrafts() {
  const drafts = new Map<string, { owner: string; id: string; entry: ReturnType<typeof createEntry> }>();
  const owner = (sessionId: string, agentId: string) => JSON.stringify([sessionId, agentId]);
  return {
    get(sessionId: string, agentId: string, pending: PendingQuestion) {
      const key = JSON.stringify([sessionId, agentId, pending.id]);
      let draft = drafts.get(key);
      if (!draft) {
        draft = { owner: owner(sessionId, agentId), id: pending.id, entry: createEntry(pending) };
        drafts.set(key, draft);
      }
      return draft.entry;
    },
    reconcile(sessionId: string, agentId: string, pendingIds: string[]) {
      const scope = owner(sessionId, agentId);
      for (const [key, draft] of drafts) if (draft.owner === scope && !pendingIds.includes(draft.id)) drafts.delete(key);
    },
    clear() { drafts.clear(); },
  };
}
export const questionDrafts = createQuestionDrafts();
