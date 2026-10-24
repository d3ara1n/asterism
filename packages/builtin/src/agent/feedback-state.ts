import type { ObjectExecutor, ObjectReader } from "@atelier/sdk/runtime";
import { AgentSoftwareFeedback, type AgentFeedback, type InlineFeedback } from "./feedback.ts";

type FeedbackState = { inline: readonly InlineFeedback[]; interruptions: readonly (string | null)[] };
const empty: FeedbackState = { inline: [], interruptions: [] };

/** 资源生命周期内的反馈；位置只关联已有节点，保存和回溯均不制造历史记录。 */
export function createAgentFeedback() {
  const states = new Map<string, FeedbackState>();
  let nextId = 0;
  return {
    get: (object: ObjectReader): FeedbackState => states.get(object.ref.id) ?? empty,
    report(object: ObjectExecutor, value: AgentFeedback, interrupted = false): void {
      const afterNodeId = object.session.snapshot().position.nodeId;
      const previous = states.get(object.ref.id) ?? empty;
      states.set(object.ref.id, {
        inline: value.origin === "model"
          ? [...previous.inline, { ...value, id: `feedback:${++nextId}`, afterNodeId }] : previous.inline,
        interruptions: interrupted ? [...previous.interruptions, afterNodeId] : previous.interruptions,
      });
      object.invalidate();
      if (value.origin === "software") object.events.publish(AgentSoftwareFeedback, value);
    },
    delete: (id: string) => { states.delete(id); },
    clear: () => { states.clear(); },
  };
}
