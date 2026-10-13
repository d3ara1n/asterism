import { type UiText } from "@atelier/sdk/contracts";
import type { RendererObjectContext } from "@atelier/sdk/renderer";
import { agentAction, SubmitAgentInput, type AgentCommand } from "../contract";
import { type AgentSelection } from "../../../shared/model";
import { useState, useSyncExternalStore } from "react";
import { SubmissionIdentity } from "../../../renderer/shared/submission";
import { createMessageDraft } from "./draft";

/** 草稿与提交身份随会话／对象保留，卡片重挂载不丢失文件和重试资格。 */
const interactions = new Map<string, { draft: ReturnType<typeof createMessageDraft>; submission: SubmissionIdentity; pending: boolean }>();
export function useAgentConversation(object: RendererObjectContext, hasSelection: boolean) {
  const key = JSON.stringify([object.ref.sessionId, object.ref.id]);
  let entry = interactions.get(key);
  if (!entry) {
    entry = { draft: createMessageDraft(() => object.input(SubmitAgentInput)), submission: new SubmissionIdentity(), pending: false };
    interactions.set(key, entry);
  }
  const current = entry;
  const { draft, submission } = current;
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const [error, setError] = useState<UiText | null>(null);
  const command = (value: AgentCommand) => object.invoke(agentAction(value), value);
  const { ready, busy, status } = object.view;
  const writable = ready && !busy && status === "ready" && !object.activity.running && hasSelection;
  return {
    draft, error, setError, writable, configurable: ready && !busy && status === "ready",
    async configure(selection: AgentSelection) {
      const result = await command({ type: "configure", selection });
      if (result.ok) setError(null);
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
    async resume() { if (writable) await command({ type: "continue" }); },
    cancel: () => command({ type: "cancel" }),
  };
}
