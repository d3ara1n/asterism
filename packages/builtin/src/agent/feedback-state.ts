import type { ErrorDetails } from "@asterism-app/sdk/contracts";
import type { ObjectExecutor, ObjectReader } from "@asterism-app/sdk/runtime";
import type { AgentFeedback, InlineFeedback, CompressionActivity, AgentActivity } from "./feedback.ts";

type FeedbackState = { inline: readonly InlineFeedback[]; interruptions: readonly (string | null)[]; compressions: readonly CompressionActivity[]; activity: AgentActivity | null };
const empty: FeedbackState = { inline: [], interruptions: [], compressions: [], activity: null };

/** Feedback within the resource lifecycle; positions reference only existing nodes, and neither saving nor rewinding creates history records. */
export function createAgentFeedback() {
  const states = new Map<string, FeedbackState>();
  let nextId = 0;
  return {
    get: (object: ObjectReader): FeedbackState => states.get(object.ref.id) ?? empty,
    activity(object: ObjectExecutor, activity: AgentActivity | null): void {
      const previous = states.get(object.ref.id) ?? empty;
      const before = previous.activity;
      if (before === activity || (before && activity && before.attempt === activity.attempt
        && before.max === activity.max && before.resumeAt === activity.resumeAt)) return;
      states.set(object.ref.id, { ...previous, activity });
      object.invalidate();
    },
    report(object: ObjectExecutor, value: AgentFeedback, interrupted = false): void {
      const afterNodeId = object.session.snapshot().position.nodeId;
      const previous = states.get(object.ref.id) ?? empty;
      states.set(object.ref.id, {
        ...previous,
        inline: [...previous.inline, { ...value, id: `feedback:${++nextId}`, afterNodeId }],
        interruptions: interrupted ? [...previous.interruptions, afterNodeId] : previous.interruptions,
      });
      object.invalidate();
    },
    beginCompression(object: ObjectExecutor) {
      const activity: CompressionActivity = { id: `compression:${++nextId}`,
        afterNodeId: object.session.snapshot().position.nodeId, status: "running" };
      const previous = states.get(object.ref.id) ?? empty;
      states.set(object.ref.id, { ...previous, compressions: [...previous.compressions, activity] });
      object.invalidate();
      return (status: "completed" | "failed" | "cancelled", details?: ErrorDetails) => {
        const current = states.get(object.ref.id) ?? empty;
        const compressions = current.compressions.flatMap(value => value.id !== activity.id ? [value]
          : status === "completed" ? [] : [{ ...value, status, ...(details ? { details } : {}) }]);
        states.set(object.ref.id, { ...current, compressions });
        object.invalidate();
      };
    },
    delete: (id: string) => { states.delete(id); },
    clear: () => { states.clear(); },
  };
}
