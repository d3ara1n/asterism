import { useI18n, type RendererObjectContext, type RendererReceipt, type ContentReader, type RendererContentInput } from "@asterism/sdk/renderer";
import { SubmitAgentInput, ConfigureAgent, ContinueAgent, CancelAgent, type AgentSelection } from "@asterism/builtin-api/contracts";
import type { ModelInputPart } from "@asterism/sdk/contracts";
import { createContext, useContext, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { SubmissionIdentity } from "./submission";
import { createMessageDraft, copyDraft, type CopiedDraft } from "./draft";
import type { AgentExecutionState } from "../state";
import { DiscardAgentDraft, ExchangeAgentDraft, MoveAgentDraft, SaveAgentDraft, SetAgentDraftMode, type AgentDraft, type DraftMode } from "../drafts-contract";
import { conversationMessages } from "../../messages/conversation";
import { DraftExchange } from "./draft-exchange";

const Interaction = createContext<ReturnType<typeof useAgentConversation> | null>(null);
export const AgentConversationProvider = Interaction.Provider;
export function useConversationInteraction() {
  const interaction = useContext(Interaction);
  if (!interaction) throw new Error("Agent conversation interaction requires its card.");
  return interaction;
}

/** 草稿、交接占用和提交身份跨卡片重挂载保留；成功后统一交接，失败保持可重试。 */
const interactionKey = "asterism.builtin/agent.interaction";
export function useAgentConversation(object: RendererObjectContext, hasSelection: boolean, executionState: AgentExecutionState, drafts: readonly AgentDraft[]) {
  const i18n = useI18n();
  const current = object.retained.get(interactionKey,
    () => {
      const draft = createMessageDraft(() => object.input(SubmitAgentInput));
      const transfers = new Map<string, { signature: string; value: CopiedDraft }>();
      const clearTransfers = (keep?: RendererContentInput) => {
        for (const item of transfers.values()) if (item.value.content !== keep) void item.value.content.close();
        transfers.clear();
      };
      return { draft, submission: new SubmissionIdentity(), transfers, clearTransfers,
        exchange: new DraftExchange(draft, clearTransfers), closed: false };
    },
    async entry => {
      entry.closed = true;
      await entry.draft.close();
      await Promise.all([...entry.transfers.values()].map(item => item.value.content.close()));
    });
  const { draft, submission } = current;
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const accepted = (result: RendererReceipt) => {
    if (!result.ok) toast.error(i18n.text(result.error.display ?? result.error.message));
    return result.ok;
  };
  const { ready } = object.view;
  const editable = ready && !state.locked;
  const writable = editable && hasSelection;
  const transfer = async (key: string, parts: readonly ModelInputPart[], source: ContentReader, input: () => RendererContentInput) => {
    const signature = JSON.stringify(parts), existing = current.transfers.get(key);
    if (existing?.signature === signature) return existing.value;
    if (existing) { current.transfers.delete(key); await existing.value.content.close(); }
    const value = await copyDraft(parts, source, input());
    if (current.closed) { await value.content.close(); throw new Error("The message editor is closed."); }
    current.transfers.set(key, { signature, value });
    return value;
  };
  const { clearTransfers } = current;
  const completeExchange = async () => {
    const result = await current.exchange.retry((input, content) => object.invoke(ExchangeAgentDraft, input, { content }));
    if (!accepted(result)) return false;
    submission.accepted();
    return true;
  };
  const mutate = async (work: () => Promise<boolean>) => {
    const latest = draft.getSnapshot();
    if (!editable || latest.locked || latest.uploading || current.closed) return false;
    draft.lock(true);
    try { return await work(); }
    catch { toast.error(i18n.text(conversationMessages.draftTransferFailed)); return false; }
    finally { draft.lock(current.exchange.pending !== null); }
  };
  const send = async (): Promise<boolean> => {
    if (!writable || (!state.text.trim() && !state.files.length)) return false;
    return mutate(async () => {
      // 受理前后执行状态可变化；同一份完整输入始终保持相同提交身份。
      const parts = draft.parts(false);
      const input = { mode: "follow" as const, parts };
      const result = await object.invoke(SubmitAgentInput, {
        ...input, submissionId: submission.forInput({ contract: SubmitAgentInput.id, input }),
      }, { content: draft.content() });
      if (!accepted(result)) return false;
      submission.accepted(); clearTransfers(); draft.accepted();
      return true;
    });
  };
  return {
    draft, drafts, writable, editable, executionState, configurable: ready,
    pendingTake: current.exchange.pending !== null,
    canRetryTake: ready && !current.exchange.working,
    async retryTake(): Promise<boolean> {
      if (!ready || current.exchange.working || current.closed) return false;
      try { return await completeExchange(); }
      catch { toast.error(i18n.text(conversationMessages.draftExchangePending)); return false; }
    },
    async configure(selection: AgentSelection) { return accepted(await object.invoke(ConfigureAgent, { selection })); },
    send,
    async save(): Promise<boolean> {
      if (!state.text.trim() && !state.files.length) return false;
      if (executionState === "running") return send();
      return mutate(async () => {
        const copied = await transfer("save", draft.parts(false), draft.content(), () => object.input(SaveAgentDraft));
        const input = { parts: copied.parts };
        const result = await object.invoke(SaveAgentDraft, {
          ...input, submissionId: submission.forInput({ contract: SaveAgentDraft.id, input }),
        }, { content: copied.content });
        if (!accepted(result)) return false;
        submission.accepted(); clearTransfers(); draft.accepted();
        return true;
      });
    },
    async setMode(item: AgentDraft, mode: DraftMode) {
      if (!editable || mode === item.mode) return false;
      try { return accepted(await object.invoke(SetAgentDraftMode, { id: item.id, mode })); }
      catch { toast.error(i18n.text(conversationMessages.modeUpdateFailed)); return false; }
    },
    async discard(item: AgentDraft): Promise<boolean> {
      if (!editable) return false;
      try { return accepted(await object.invoke(DiscardAgentDraft, { id: item.id })); }
      catch { toast.error(i18n.text(conversationMessages.draftTransferFailed)); return false; }
    },
    async move(item: AgentDraft, before: string | null): Promise<boolean> {
      if (!editable) return false;
      try { return accepted(await object.invoke(MoveAgentDraft, { id: item.id, before })); }
      catch { toast.error(i18n.text(conversationMessages.draftTransferFailed)); return false; }
    },
    async take(item: AgentDraft): Promise<boolean> {
      return mutate(async () => {
        // 先为取回内容建立编辑器占用，再原子交换持久条目，最后替换可见编辑器。
        const incoming = await transfer("take", item.parts, object.content, () => object.input(SubmitAgentInput));
        const parts = draft.parts(false);
        const replacement = state.text.trim() || state.files.length
          ? await transfer("exchange", parts, draft.content(), () => object.input(ExchangeAgentDraft)) : null;
        const input = { id: item.id, replacement: replacement?.parts ?? null };
        current.exchange.begin({ input: {
          ...input, submissionId: submission.forInput({ contract: ExchangeAgentDraft.id, input }),
        }, incoming, replacement });
        return completeExchange();
      });
    },
    async resume() { if (writable && executionState === "incomplete") accepted(await object.invoke(ContinueAgent, {})); },
    cancel: async () => accepted(await object.invoke(CancelAgent, {})),
  };
}
