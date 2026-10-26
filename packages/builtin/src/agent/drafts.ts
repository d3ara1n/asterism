import { PluginApiError, type ObjectExecutor, type ObjectReader } from "@asterism/sdk/runtime";
import { AgentInputMessage } from "@asterism/builtin-api/contracts";
import { AgentDrafts } from "./data.ts";
import type { AgentDraft, DraftMode } from "./drafts-contract.ts";
import { duplicateSubmission, rememberSubmission } from "./submissions.ts";

export function saveDraft(object: ObjectExecutor, input: { submissionId: string; parts: AgentDraft["parts"] }): void {
  if (duplicateSubmission(object, input)) return;
  object.commit(writer => {
    writer.set(AgentDrafts, [...object.get(AgentDrafts) ?? [], { id: input.submissionId, mode: "none", parts: input.parts, sender: { kind: "user" } }]);
    rememberSubmission(object, writer, input);
  });
}
function currentDraft(object: ObjectReader, id: string) {
  const drafts = object.get(AgentDrafts) ?? [];
  const draft = drafts.find(item => item.id === id);
  if (!draft)
    throw new PluginApiError("not_found", "The draft has already been sent or taken out.");
  return { drafts, draft };
}
export function setDraftMode(object: ObjectExecutor, input: { id: string; mode: DraftMode }): void {
  object.commit(writer => {
    const { drafts } = currentDraft(object, input.id);
    writer.set(AgentDrafts, drafts.map(item => item.id === input.id ? { ...item, mode: input.mode } : item));
  });
}
export function exchangeDraft(object: ObjectExecutor, input: {
  submissionId: string; id: string; replacement: AgentDraft["parts"] | null;
}): void {
  if (duplicateSubmission(object, input)) return;
  object.commit(writer => {
    const { drafts } = currentDraft(object, input.id);
    writer.set(AgentDrafts, drafts.flatMap(item => item.id !== input.id ? [item]
      : input.replacement ? [{ ...item, mode: "none" as const, parts: input.replacement, sender: { kind: "user" as const } }] : []));
    rememberSubmission(object, writer, input);
  });
}
/** 丢弃与排序按身份作用，重放同一意图得到同一结果；条目已消费时返回 not_found。 */
export function discardDraft(object: ObjectExecutor, input: { id: string }): void {
  object.commit(writer => {
    const { drafts } = currentDraft(object, input.id);
    writer.set(AgentDrafts, drafts.filter(item => item.id !== input.id));
  });
}
export function moveDraft(object: ObjectExecutor, input: { id: string; before: string | null }): void {
  object.commit(writer => {
    const { drafts, draft } = currentDraft(object, input.id);
    if (input.before === input.id) return;
    const rest = drafts.filter(item => item.id !== input.id);
    // 顺序即交付顺序；锚点已被消费时退回末尾，不丢条目。
    const index = input.before === null ? rest.length : rest.findIndex(item => item.id === input.before);
    const next = [...rest];
    next.splice(index < 0 ? rest.length : index, 0, draft);
    writer.set(AgentDrafts, next);
  });
}
/** 先形成完整批次，再允许循环取上下文；消息与持久附件的归属在同一事务交接。 */
export function deliverDrafts(object: ObjectExecutor, boundary: "request" | "turn"): boolean {
  const drafts = object.get(AgentDrafts) ?? [];
  const batch = drafts.filter(item => item.mode === "steer" || boundary === "turn" && item.mode === "follow");
  if (!batch.length) return false;
  const ids = new Set(batch.map(item => item.id));
  object.commit(writer => {
    for (const [index, draft] of batch.entries())
      writer.append(AgentInputMessage, { parts: draft.parts, startsTurn: boundary === "turn" && index === 0, sender: draft.sender });
    writer.set(AgentDrafts, drafts.filter(item => !ids.has(item.id)));
  });
  return true;
}
