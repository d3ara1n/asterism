import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const waitMessages = builtin.messages("en", defineMessages({
  title: { id: "tools.agents.wait", defaultMessage: "Wait for agent" },
  state: { id: "tools.agents.waitState", defaultMessage: "{state, select, completed {Completed} incomplete {Incomplete} empty {No turn} other {Still running}}" },
}));
