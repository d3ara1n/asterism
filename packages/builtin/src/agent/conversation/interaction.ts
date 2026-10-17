import { type UiText } from "@atelier/sdk/contracts";
import type { RendererObjectContext } from "@atelier/sdk/renderer";
import { agentAction, SubmitAgentInput, type AgentCommand, type AgentSelection } from "@atelier/builtin-api/contracts";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { SubmissionIdentity } from "./submission";
import { createMessageDraft } from "./draft";
import type { AgentExecutionState } from "../state";

const Interaction = createContext<ReturnType<typeof useAgentConversation> | null>(null);
export const AgentConversationProvider = Interaction.Provider;
export function useConversationInteraction() {
  const interaction = useContext(Interaction);
  if (!interaction) throw new Error("Agent conversation interaction requires its card.");
  return interaction;
}

/** 草稿与提交身份由宿主按对象保留：卡片重挂载、聚焦与会话切换不丢失文件和重试资格，对象离开投影时关闭草稿。 */
const interactionKey = "atelier.builtin/agent.interaction";
export function useAgentConversation(object: RendererObjectContext, hasSelection: boolean, executionState: AgentExecutionState) {
  const current = object.retained.get(interactionKey,
    () => ({ draft: createMessageDraft(() => object.input(SubmitAgentInput)), submission: new SubmissionIdentity(), pending: false }),
    entry => entry.draft.close());
  const { draft, submission } = current;
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const [error, setError] = useState<UiText | null>(null);
  const command = (value: AgentCommand) => object.invoke(agentAction(value), value);
  const { ready, busy, status } = object.view;
  const writable = ready && !busy && status === "ready" && executionState !== "running" && hasSelection;
  return {
    draft, error, setError, writable, executionState, configurable: ready && !busy && status === "ready",
    async configure(selection: AgentSelection) {
      const result = await command({ type: "configure", selection });
      if (result.ok) setError(null);
      return result.ok;
    },
    async send(): Promise<boolean> {
      if (!writable || current.pending || state.uploading) return false;
      const parts = draft.parts();
      if (!parts.length) return false;
      current.pending = true;
      try {
        const input = { agentId: object.ref.id, parts };
        const result = await object.invoke(SubmitAgentInput, { type: "submit", parts, submissionId: submission.forInput(input) }, { content: draft.content() });
        if (!result.ok) return false;
        submission.accepted(); draft.accepted(); setError(null);
        return true;
      } finally { current.pending = false; }
    },
    async resume() { if (writable && executionState === "incomplete") await command({ type: "continue" }); },
    cancel: () => command({ type: "cancel" }),
  };
}
