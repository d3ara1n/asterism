import type { RendererModule } from "@atelier/sdk/renderer";
import { toast } from "sonner";
import { AgentSoftwareFeedback } from "./feedback";
import { ExecutionErrorDetails } from "./ErrorDetails";

/** 执行反馈订阅由独立模块持有准备与清理作用域。 */
export const agentFeedbackRenderer = {
  resources: [], cards: [], tools: [],
  async prepare({ signal, events }) {
    await events.subscribe(AgentSoftwareFeedback, { signal }, ({ data }) => {
      const options = data.details ? {
        description: <ExecutionErrorDetails code={data.code} details={data.details} />,
        duration: Infinity, closeButton: true,
      } : undefined;
      if (data.level === "error") toast.error(data.message, options);
      else toast.warning(data.message, options);
    }).ready;
  },
} satisfies RendererModule;
