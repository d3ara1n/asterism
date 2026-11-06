import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const commandMessages = builtin.messages("en", defineMessages({
  session: { id: "command.session", defaultMessage: "Session" },
  title: { id: "command.title", defaultMessage: "Commands" },
  placeholder: { id: "command.placeholder", defaultMessage: "Search commands…" },
  empty: { id: "command.empty", defaultMessage: "No results" },
}));
