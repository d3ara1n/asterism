import { defineCreation, defineAction, type ActionContract } from "@atelier/sdk/contracts";
import { z } from "zod";
import { builtin } from "./identity.ts";
import { userInputPartsSchema } from "./input.ts";
import { agentSelectionSchema } from "./configuration.ts";

/** 代理是普通资源：创建事件只记录身份；模型选择等可变数据属于资源私有状态。 */
export const Agent = builtin.resource("agent", z.object({}));
/** 首页发起时默认选用的内置代理预设。 */
export const defaultAgentPreset = "worker";
/** 首页首次提交的宿主草稿目标；不属于可路由到已有对象的动作。 */
export const startAgentContentTarget = { contractId: builtin.name("session.start"), resourceKind: Agent.kind } as const;
/** 代理卡片发出的资源命令；由代理控制器执行，会话只负责路由与记录事件。 */
export const agentCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("submit"), submissionId: z.string().uuid(), parts: userInputPartsSchema }),
  z.strictObject({ type: z.literal("continue") }),
  z.strictObject({ type: z.literal("configure"), selection: agentSelectionSchema }),
  z.strictObject({ type: z.literal("cancel") }),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;
/** 创建代理资源时的初始数据。 */
/** title 可选，不填时用 agent 配置名。 */
export const agentCreateSchema = z.strictObject({ selection: agentSelectionSchema, title: z.string().trim().min(1).max(160).optional() });

export const CreateAgent = defineCreation(Agent, { id: builtin.name("agent.create"), schema: agentCreateSchema });
export const SubmitAgentInput = defineAction(Agent, { id: builtin.name("agent.submit"), schema: agentCommandSchema.options[0] });
export const ContinueAgent = defineAction(Agent, { id: builtin.name("agent.continue"), schema: agentCommandSchema.options[1] });
export const ConfigureAgent = defineAction(Agent, { id: builtin.name("agent.configure"), schema: agentCommandSchema.options[2] });
export const CancelAgent = defineAction(Agent, { id: builtin.name("agent.cancel"), schema: agentCommandSchema.options[3] });
/** 领域判别与契约路由在同一处维护，供聚合交互按意图选择动作。 */
export function agentAction(command: AgentCommand): ActionContract<AgentCommand> {
  switch (command.type) {
    case "submit": return SubmitAgentInput;
    case "continue": return ContinueAgent;
    case "configure": return ConfigureAgent;
    case "cancel": return CancelAgent;
  }
}
