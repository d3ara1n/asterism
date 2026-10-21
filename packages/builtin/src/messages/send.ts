import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const sendMessages = builtin.messages("en", defineMessages({
  title: { id: "agent_send_title", defaultMessage: "Send" },
  accepted: { id: "agent_send_accepted", defaultMessage: "Accepted" },
}));
