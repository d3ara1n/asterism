import { defineCreation, defineAction, type ActionContract } from "@atelier/sdk/contracts";
import { z } from "zod";
import { core } from "../plugin.ts";
import { agentSelectionSchema } from "../../shared/model.ts";

/** 代理是普通资源：创建事件只记录身份；模型选择等可变数据属于资源私有状态。 */
export const Agent = core.resource("agent", z.object({}));
export const AgentSelection = core.data("agent.selection", z.strictObject({
  selection: agentSelectionSchema, revision: z.number().int().nonnegative(),
}));
export const AgentSubmissions = core.data("agent.submissions", z.record(z.string(), z.string()));
export const AgentView = core.data("agent.card", z.strictObject({
  agentId: z.string(),
  selection: agentSelectionSchema.nullable(),
  selectionRevision: z.number().int().nonnegative(),
}));

const text = z.string().trim().min(1).max(100_000);
/** 代理卡片发出的资源命令；由代理控制器执行，会话只负责路由与记录事件。 */
export const agentCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("submit"), submissionId: z.string().uuid(), text }),
  z.strictObject({ type: z.literal("continue") }),
  z.strictObject({ type: z.literal("configure"), selection: agentSelectionSchema }),
  z.strictObject({ type: z.literal("cancel") }),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;
/** 创建代理资源时的初始数据。 */
/** title 可选，不填时用 agent 配置名。 */
export const agentCreateSchema = z.strictObject({ selection: agentSelectionSchema, title: z.string().trim().min(1).max(160).optional() });

export const CreateAgent = defineCreation(Agent, { id: core.name("agent.create"), schema: agentCreateSchema });
export const SubmitAgentInput = defineAction(Agent, { id: core.name("agent.submit"), schema: agentCommandSchema.options[0] });
export const ContinueAgent = defineAction(Agent, { id: core.name("agent.continue"), schema: agentCommandSchema.options[1] });
export const ConfigureAgent = defineAction(Agent, { id: core.name("agent.configure"), schema: agentCommandSchema.options[2] });
export const CancelAgent = defineAction(Agent, { id: core.name("agent.cancel"), schema: agentCommandSchema.options[3] });
/** 领域判别与契约路由在同一处维护，供聚合交互按意图选择动作。 */
export function agentAction(command: AgentCommand): ActionContract<AgentCommand> {
  switch (command.type) {
    case "submit": return SubmitAgentInput;
    case "continue": return ContinueAgent;
    case "configure": return ConfigureAgent;
    case "cancel": return CancelAgent;
  }
}
