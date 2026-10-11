import { z } from "zod";
import { agentSchema, configurationSnapshotSchema } from "../../shared/configuration.ts";
import { core } from "../plugin.ts";

/** Agent 的配置目录属于 core 领域；宿主保留应用级配置与用户覆盖。 */
export const AgentConfigurations = core.data("agent.configurations", 1, z.array(agentSchema));
export const ModelConfiguration = core.data("model.configuration", 1, configurationSnapshotSchema);
export const ThinkingPreferences = core.data("thinking.preferences", 1, z.strictObject({
  thinkingAutoExpand: z.boolean(), thinkingAutoCollapse: z.boolean(),
}));
