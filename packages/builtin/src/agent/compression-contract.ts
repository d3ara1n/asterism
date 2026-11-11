import { z } from "zod";
import { defineAction } from "@asterism-app/sdk/contracts";
import { Agent, builtin } from "@asterism-app/builtin-api/contracts";

/** Starts context-only compaction on a settled Agent; the Agent owns the resulting task. */
export const CompactAgentConversation = defineAction(Agent, {
  id: builtin.name("agent.compact"), schema: z.strictObject({}),
});
