import type { ObjectExecutor, ObjectReader } from "@asterism-app/sdk/runtime";
import { AgentSoftwareFeedback, type AgentFeedback, type InlineFeedback, type CompressionActivity } from "./feedback.ts";

type FeedbackState = { inline: readonly InlineFeedback[]; interruptions: readonly (string | null)[]; compressions: readonly CompressionActivity[] };
const empty: FeedbackState = { inline: [], interruptions: [], compressions: [] };

/** Feedback within the resource lifecycle; positions reference only existing nodes, and neither saving nor rewinding creates history records. */
export function createAgentFeedback() {
  const states = new Map<string, FeedbackState>();
  let nextId = 0;
  return {
    get: (object: ObjectReader): FeedbackState => states.get(object.ref.id) ?? empty,
    report(object: ObjectExecutor, value: AgentFeedback, interrupted = false): void {
      const afterNodeId = object.session.snapshot().position.nodeId;
      const previous = states.get(object.ref.id) ?? empty;
      states.set(object.ref.id, {
        ...previous,
        inline: value.origin === "model"
          ? [...previous.inline, { ...value, id: `feedback:${++nextId}`, afterNodeId }] : previous.inline,
        interruptions: interrupted ? [...previous.interruptions, afterNodeId] : previous.interruptions,
      });
      object.invalidate();
      if (value.origin === "software") object.events.publish(AgentSoftwareFeedback, value);
    },
    beginCompression(object: ObjectExecutor) {
      const activity: CompressionActivity = { id: `compression:${++nextId}`,
        afterNodeId: object.session.snapshot().position.nodeId, status: "running" };
      const previous = states.get(object.ref.id) ?? empty;
      states.set(object.ref.id, { ...previous, compressions: [...previous.compressions, activity] });
      object.invalidate();
      return (status: "completed" | "failed" | "cancelled") => {
        const current = states.get(object.ref.id) ?? empty;
        const compressions = current.compressions.flatMap(value => value.id !== activity.id ? [value]
          : status === "completed" ? [] : [{ ...value, status }]);
        states.set(object.ref.id, { ...current, compressions });
        object.invalidate();
      };
    },
    delete: (id: string) => { states.delete(id); },
    clear: () => { states.clear(); },
  };
}
