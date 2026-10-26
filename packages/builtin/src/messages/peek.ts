import { defineMessages } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";

export const peekMessages = builtin.messages("en", defineMessages({
  title: { id: "peek.title", defaultMessage: "Peek" },
  preparing: { id: "peek.preparing", defaultMessage: "Preparing…" },
  waiting: { id: "peek.waiting", defaultMessage: "Waiting…" },
  investigating: { id: "peek.investigating", defaultMessage: "Investigating…" },
  thinking: { id: "peek.thinking", defaultMessage: "Thinking…" },
  searching: { id: "peek.searching", defaultMessage: "Searching…" },
  reading: { id: "peek.reading", defaultMessage: "Reading…" },
  writing: { id: "peek.writing", defaultMessage: "Writing report…" },
  done: { id: "peek.done", defaultMessage: "Report ready" },
}));
