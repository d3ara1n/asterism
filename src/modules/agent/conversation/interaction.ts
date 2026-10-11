import type { RendererObjectContext } from "@atelier/sdk/renderer";
import { agentAction, type AgentCommand } from "../contract";
import type { AgentSelection } from "../../../shared/model";
import { useState, useSyncExternalStore } from "react";
import type { ResourceRef } from "@atelier/sdk/contracts";
import { SubmissionIdentity } from "../../../renderer/shared/submission";

/** 交互状态随会话／对象保留，卡片重挂载不丢失草稿或重试身份。 */
const interactions = new Map<string, ReturnType<typeof createInteraction>>();
function createInteraction() {
  let draft = "";
  const listeners = new Set<() => void>();
  return {
    submission: new SubmissionIdentity(),
    get: () => draft,
    set(value: string) { draft = value; for (const listener of listeners) listener(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export function useAgentInteraction(ref: ResourceRef) {
  const key = JSON.stringify([ref.sessionId, ref.id]);
  let entry = interactions.get(key);
  if (!entry) { entry = createInteraction(); interactions.set(key, entry); }
  const draft = useSyncExternalStore(entry.subscribe, entry.get);
  return { draft, setDraft: entry.set, submission: entry.submission };
}

/** 将草稿、重试身份和受理结果组合为 Agent 的交互意图。 */
export function useAgentConversation(object: RendererObjectContext, hasSelection: boolean) {
  const { draft, setDraft, submission } = useAgentInteraction(object.ref);
  const [error, setError] = useState<string | null>(null);
  const command = (value: AgentCommand) => object.invoke(agentAction(value), value);
  const { ready, busy, historical, status } = object.view;
  const writable = ready && !busy && status === "ready" && !object.activity.running && !historical && hasSelection;
  return {
    draft, setDraft, error, setError, writable, configurable: ready && !busy && status === "ready",
    async configure(selection: AgentSelection) {
      const result = await command({ type: "configure", selection });
      if (result.ok) setError(null);
    },
    async send(): Promise<boolean> {
      if (!writable || !draft.trim()) return false;
      const input = { agentId: object.ref.id, text: draft.trim() };
      const result = await command({ type: "submit", text: input.text, submissionId: submission.forInput(input) });
      if (!result.ok) return false;
      submission.accepted(); setDraft("");
      return true;
    },
    async resume() { if (writable) await command({ type: "continue" }); },
    cancel: () => command({ type: "cancel" }),
  };
}
