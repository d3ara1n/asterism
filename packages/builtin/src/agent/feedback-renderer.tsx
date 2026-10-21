import type { RendererModule } from "@atelier/sdk/renderer";
import { toast } from "sonner";
import { AgentExecutionFeedback } from "./feedback";

/** 执行反馈订阅由独立模块持有准备与清理作用域。 */
export const agentFeedbackRenderer = {
  resources: [], cards: [], tools: [],
  async prepare({ signal, events }) {
    await events.subscribe(AgentExecutionFeedback, { signal }, ({ data }) => {
      if (data.level === "error") toast.error(data.message);
      else toast.warning(data.message);
    }).ready;
  },
} satisfies RendererModule;
