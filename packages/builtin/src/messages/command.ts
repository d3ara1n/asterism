import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const commandMessages = builtin.messages("en", defineMessages({
  session: { id: "command.session", defaultMessage: "Session" },
  conversation: { id: "command.conversation", defaultMessage: "Conversation" },
  compact: { id: "command.compact", defaultMessage: "Compact conversation" },
  nothingToCompact: { id: "command.nothingToCompact", defaultMessage: "No content to compact." },
  compactFailed: { id: "command.compactFailed", defaultMessage: "Could not compact the conversation." },
  title: { id: "command.title", defaultMessage: "Commands" },
  placeholder: { id: "command.placeholder", defaultMessage: "Search commands…" },
  empty: { id: "command.empty", defaultMessage: "No results" },
}));
