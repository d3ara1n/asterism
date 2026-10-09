import { z } from "zod";
import { defineResource } from "../../shared/module-contract.ts";
import { defineData } from "../../shared/presentation.ts";

export const Agent = defineResource("agent", z.object({}));
export const AgentView = defineData("weft.agent.card", 1, z.strictObject({ agentId: z.string() }));
