import { defineMessages } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";

export const sendMessages = builtin.messages("en", defineMessages({
  title: { id: "agent_send_title", defaultMessage: "Send" },
  accepted: { id: "agent_send_accepted", defaultMessage: "Accepted" },
}));
