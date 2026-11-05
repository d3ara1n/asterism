import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const peekMessages = builtin.messages("en", defineMessages({
  title: { id: "peek.title", defaultMessage: "Peek" },
  explain: { id: "peek.explain", defaultMessage: "Explain current conversation" },
  question: { id: "peek.question", defaultMessage: "What would you like to understand about this conversation?" },
  failed: { id: "peek.failed", defaultMessage: "Failed" },
  cancelled: { id: "peek.cancelled", defaultMessage: "Stopped" },
  partial: { id: "peek.partial", defaultMessage: "Incomplete" },
  preparing: { id: "peek.preparing", defaultMessage: "Preparing…" },
  waiting: { id: "peek.waiting", defaultMessage: "Waiting…" },
  investigating: { id: "peek.investigating", defaultMessage: "Investigating…" },
  thinking: { id: "peek.thinking", defaultMessage: "Thinking…" },
  searching: { id: "peek.searching", defaultMessage: "Searching…" },
  reading: { id: "peek.reading", defaultMessage: "Reading…" },
  writing: { id: "peek.writing", defaultMessage: "Writing report…" },
  done: { id: "peek.done", defaultMessage: "Report ready" },
}));
