import type { RendererModule } from "@asterism/sdk/renderer";
import { QuestionsChanged } from "./contract";
import { questionDrafts } from "./drafts";
import { questionToolRenderer } from "./tool-view";

export default {
  resources: [], cards: [], tools: [questionToolRenderer],
  async prepare({ signal, events }) {
    // The answer UI lives in the tool execution body; clean up drafts against the current list after waiting ends.
    const subscription = events.subscribe(QuestionsChanged, { delivery: "latest", signal }, ({ data }) => {
      questionDrafts.reconcile(data.sessionId, data.agentId, data.pending.map(item => item.id));
    });
    signal.addEventListener("abort", () => questionDrafts.clear(), { once: true });
    await subscription.ready;
  },
} satisfies RendererModule;
