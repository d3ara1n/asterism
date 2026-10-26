import { defineMessages } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";

export const waitMessages = builtin.messages("en", defineMessages({
  title: { id: "agent_wait_title", defaultMessage: "Wait for agent" },
  state: { id: "agent_wait_state", defaultMessage: "{state, select, completed {Completed} incomplete {Incomplete} empty {No turn} other {Still running}}" },
}));
