import { PluginApiError, type ObjectExecutor, type ObjectReader } from "@atelier/sdk/runtime";
import { AgentInputMessage } from "@atelier/builtin-api/contracts";
import { AgentDrafts } from "./data.ts";
import { SaveAgentDraft, ExchangeAgentDraft, type AgentDraft, type DraftMode } from "./drafts-contract.ts";
import { duplicateSubmission, rememberSubmission } from "./submissions.ts";

export function saveDraft(object: ObjectExecutor, input: { submissionId: string; parts: AgentDraft["parts"] }): void {
  if (duplicateSubmission(object, SaveAgentDraft, input)) return;
  object.commit(writer => {
    writer.set(AgentDrafts, [...object.get(AgentDrafts) ?? [], { id: input.submissionId, revision: 0, mode: "none", parts: input.parts, sender: { kind: "user" } }]);
    rememberSubmission(object, writer, SaveAgentDraft, input);
  });
}
function currentDraft(object: ObjectReader, id: string, revision: number) {
  const drafts = object.get(AgentDrafts) ?? [];
  const draft = drafts.find(item => item.id === id);
  if (!draft || draft.revision !== revision)
    throw new PluginApiError("conflict", "The draft has changed or has already been sent.", "draft_changed");
  return { drafts, draft };
}
export function setDraftMode(object: ObjectExecutor, input: { id: string; revision: number; mode: DraftMode }): void {
  object.commit(writer => {
    const { drafts } = currentDraft(object, input.id, input.revision);
    writer.set(AgentDrafts, drafts.map(item => item.id === input.id ? { ...item, revision: item.revision + 1, mode: input.mode } : item));
  });
}
export function exchangeDraft(object: ObjectExecutor, input: {
  submissionId: string; id: string; revision: number; replacement: AgentDraft["parts"] | null;
}): void {
  if (duplicateSubmission(object, ExchangeAgentDraft, input)) return;
  object.commit(writer => {
    const { drafts } = currentDraft(object, input.id, input.revision);
    writer.set(AgentDrafts, drafts.flatMap(item => item.id !== input.id ? [item]
      : input.replacement ? [{ ...item, revision: item.revision + 1, mode: "none" as const, parts: input.replacement, sender: { kind: "user" as const } }] : []));
    rememberSubmission(object, writer, ExchangeAgentDraft, input);
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
