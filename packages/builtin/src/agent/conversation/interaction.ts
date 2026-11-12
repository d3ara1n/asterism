import { useI18n, type RendererObjectContext, type RendererReceipt } from "@asterism-app/sdk/renderer";
import { SubmitAgentInput, ConfigureAgent, ContinueAgent, CancelAgent, type AgentSelection } from "@asterism-app/builtin-api/contracts";
import { createContext, useContext, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { composerTextLimit } from "./draft";
import type { AgentExecutionState } from "../state";
import { DiscardAgentDraft, ExchangeAgentDraft, MoveAgentDraft, SaveAgentDraft, SetAgentDraftMode, type AgentDraft, type DraftMode } from "../drafts-contract";
import { conversationMessages } from "../../messages/conversation";
import { ConversationInput } from "./conversation-input";

const Interaction = createContext<ReturnType<typeof useAgentConversation> | null>(null);
export const AgentConversationProvider = Interaction.Provider;
export function useConversationInteraction() {
  const interaction = useContext(Interaction);
  if (!interaction) throw new Error("Agent conversation interaction requires its card.");
  return interaction;
}

/** Drafts, handoff holds, and submission identities survive card remounts; success completes the handoff together, while failure preserves retryability. */
const interactionKey = "asterism.builtin/agent.interaction";

/** Keep only the identity-bound input capability, not the view context and its captured session observation. */
function createInteraction(input: RendererObjectContext["input"]) {
  return new ConversationInput(() => input(SubmitAgentInput));
}
// Retention also owns the disposer; defining it here avoids retaining the hook's shared closure context.
const closeInteraction = (input: ConversationInput) => input.close();
export function useAgentConversation(object: RendererObjectContext, hasSelection: boolean, executionState: AgentExecutionState, drafts: readonly AgentDraft[]) {
  const i18n = useI18n();
  const current = object.retained.get(interactionKey,
    () => createInteraction(object.input),
    closeInteraction);
  const { draft, submission } = current;
  const phase = useSyncExternalStore(current.subscribe, current.getSnapshot);
  const accepted = (result: RendererReceipt) => {
    if (!result.ok) toast.error(i18n.text(result.error.display ?? result.error.message));
    return result.ok;
  };
  const { ready } = object.view;
  const editable = ready && phase === "idle";
  const writable = editable && hasSelection;
  const mutate = async (work: () => Promise<boolean>) => {
    if (!editable) return false;
    try { return await current.mutate(work); }
    catch { toast.error(i18n.text(conversationMessages.draftTransferFailed)); return false; }
  };
  const send = async (): Promise<boolean> => {
    const state = draft.getSnapshot();
    if (!writable || (!state.text.trim() && !state.files.length)) return false;
    return mutate(async () => {
      // Execution state may change around acceptance; the same complete input always retains the same submission identity.
      const parts = draft.parts(false);
      const input = { mode: "follow" as const, parts };
      const result = await object.invoke(SubmitAgentInput, {
        ...input, submissionId: submission.forInput({ contract: SubmitAgentInput.id, input }),
      }, { content: draft.content() });
      if (!accepted(result)) return false;
      submission.accepted(); current.clearTransfers(); draft.accepted();
      return true;
    });
  };
  /** Preserve the complete current input in the draft box with mode none before replacing it. */
  const replaceInput = (text: string): Promise<boolean> => mutate(async () => {
    if (text.length > composerTextLimit) {
      toast.error(i18n.formatMessage(conversationMessages.inputTooLong, { limit: composerTextLimit }));
      return false;
    }
    const latest = draft.getSnapshot();
    if (latest.text.trim() || latest.files.length) {
      const copied = await current.transfer("save", draft.parts(false), draft.content(), () => object.input(SaveAgentDraft));
      const input = { parts: copied.parts };
      const result = await object.invoke(SaveAgentDraft, {
        ...input, submissionId: submission.forInput({ contract: SaveAgentDraft.id, input }),
      }, { content: copied.content });
      if (!accepted(result)) return false;
      submission.accepted(); current.clearTransfers();
    }
    draft.accepted(text);
    return true;
  });
  return {
    draft, drafts, writable, editable, executionState, configurable: ready,
    // Only an exchange whose receipt was unknown needs the user; an exchange still in its first attempt is ordinary work.
    pendingTake: phase === "unconfirmed" || phase === "retrying",
    canRetryTake: ready && phase === "unconfirmed",
    async retryTake(): Promise<boolean> {
      if (!ready) return false;
      try {
        const result = await current.retryExchange((input, content) => object.invoke(ExchangeAgentDraft, input, { content }));
        return result ? accepted(result) : false;
      } catch { toast.error(i18n.text(conversationMessages.draftExchangePending)); return false; }
    },
    async configure(selection: AgentSelection) { return accepted(await object.invoke(ConfigureAgent, { selection })); },
    send,
    save: (): Promise<boolean> => replaceInput(""),
    insertSavedText: replaceInput,
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
        // First establish an editor hold for the retrieved content, then atomically exchange the persistent item, and finally replace the visible editor.
        const incoming = await current.transfer("take", item.parts, object.content, () => object.input(SubmitAgentInput));
        const parts = draft.parts(false), state = draft.getSnapshot();
        const replacement = state.text.trim() || state.files.length
          ? await current.transfer("exchange", parts, draft.content(), () => object.input(ExchangeAgentDraft)) : null;
        const input = { id: item.id, replacement: replacement?.parts ?? null };
        return accepted(await current.exchange({ input: {
          ...input, submissionId: submission.forInput({ contract: ExchangeAgentDraft.id, input }),
        }, incoming, replacement }, (input, content) => object.invoke(ExchangeAgentDraft, input, { content })));
      });
    },
    async resume() { if (writable && executionState === "incomplete") accepted(await object.invoke(ContinueAgent, {})); },
    cancel: async () => accepted(await object.invoke(CancelAgent, {})),
  };
}
