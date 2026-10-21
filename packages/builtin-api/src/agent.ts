import { defineCreation, defineAction } from "@atelier/sdk/contracts";
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
/** 待发送输入在请求边界或回合边界交付；空闲时直接开始执行。 */
export const agentInputModeSchema = z.enum(["steer", "follow"]);
/** title 可选，不填时用 agent 配置名。 */
export const agentCreateSchema = z.strictObject({ selection: agentSelectionSchema, title: z.string().trim().min(1).max(160).optional() });

export const CreateAgent = defineCreation(Agent, { id: builtin.name("agent.create"), schema: agentCreateSchema });
export const SubmitAgentInput = defineAction(Agent, {
  id: builtin.name("agent.submit"),
  schema: z.strictObject({ submissionId: z.string().uuid(), parts: userInputPartsSchema, mode: agentInputModeSchema }),
});
export type SubmitAgentInputData = z.infer<typeof SubmitAgentInput.schema>;
export const ContinueAgent = defineAction(Agent, { id: builtin.name("agent.continue"), schema: z.strictObject({}) });
export const ConfigureAgent = defineAction(Agent, {
  id: builtin.name("agent.configure"), schema: z.strictObject({ selection: agentSelectionSchema }),
});
export const CancelAgent = defineAction(Agent, { id: builtin.name("agent.cancel"), schema: z.strictObject({}) });
