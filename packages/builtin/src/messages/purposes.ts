import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const purposeMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  conversation: { id: "purpose.conversation", defaultMessage: "Conversation" },
  subagent: { id: "purpose.subagent", defaultMessage: "Subagent" },
  compression: { id: "purpose.compression", defaultMessage: "Context compression" },
  naming: { id: "purpose.naming", defaultMessage: "Session naming" },
  peek: { id: "purpose.peek", defaultMessage: "Peek" },
}));
