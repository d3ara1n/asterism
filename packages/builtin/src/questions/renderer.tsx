import type { RendererModule } from "@asterism/sdk/renderer";
import { QuestionsChanged } from "./contract";
import { questionDrafts } from "./drafts";
import { questionToolRenderer } from "./tool-view";

export default {
  resources: [], cards: [], tools: [questionToolRenderer],
  async prepare({ signal, events }) {
    // 作答界面位于工具执行正文；等待结束后按当前列表清理草稿。
    const subscription = events.subscribe(QuestionsChanged, { delivery: "latest", signal }, ({ data }) => {
      questionDrafts.reconcile(data.sessionId, data.agentId, data.pending.map(item => item.id));
    });
    signal.addEventListener("abort", () => questionDrafts.clear(), { once: true });
    await subscription.ready;
  },
} satisfies RendererModule;
