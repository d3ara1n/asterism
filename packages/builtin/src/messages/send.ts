import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const sendMessages = builtin.messages("en", defineMessages({
  title: { id: "tools.messages.send", defaultMessage: "Send" },
  accepted: { id: "tools.messages.accepted", defaultMessage: "Accepted" },
}));
