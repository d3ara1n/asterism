import type { RendererModule } from "@asterism-app/sdk/renderer";
import { toast } from "sonner";
import { AgentSoftwareFeedback } from "./feedback";
import { ExecutionErrorDetails } from "./ErrorDetails";

/** A separate module owns the preparation and cleanup scopes for execution-feedback subscriptions. */
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
