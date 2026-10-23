import { defineCreation, defineAction } from "@atelier/sdk/contracts";
import { z } from "zod";
import { builtin } from "./identity.ts";
import { userInputPartsSchema } from "./input.ts";
import { agentSelectionSchema } from "./configuration.ts";
import { agentMessageSenderSchema } from "./messaging.ts";

/** 代理是普通资源：创建事件只记录身份；模型选择等可变数据属于资源私有状态。 */
export const Agent = builtin.resource("agent", z.object({}));
/** 首页发起时默认选用的内置代理预设。 */
export const defaultAgentPreset = "worker";
/** 首页首次提交的宿主草稿目标；不属于可路由到已有对象的动作。 */
export const startAgentContentTarget = { contractId: builtin.name("session.start"), resourceKind: Agent.kind } as const;
/** 待发送输入在请求边界或回合边界交付；空闲时直接开始执行。 */
export const agentInputModeSchema = z.enum(["steer", "follow"]);
/** 提交与草稿共用 16 位 Nano ID 身份。 */
export const submissionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/u);
/** title 可选，不填时用 agent 配置 ID。 */
export const agentCreateSchema = z.strictObject({
  selection: agentSelectionSchema,
  title: z.string().trim().min(1).max(160).optional().describe("Display title for the new Agent. Defaults to the selected configuration ID."),
}).describe("Agent configuration and title.");

export const CreateAgent = defineCreation(Agent, { id: builtin.name("agent.create"), schema: agentCreateSchema });
export const SubmitAgentInput = defineAction(Agent, {
  id: builtin.name("agent.submit"),
  schema: z.strictObject({
    submissionId: submissionIdSchema, parts: userInputPartsSchema, mode: agentInputModeSchema,
    sender: agentMessageSenderSchema.default({ kind: "user" }),
  }),
});
export type SubmitAgentInputData = z.infer<typeof SubmitAgentInput.schema>;
export const ContinueAgent = defineAction(Agent, { id: builtin.name("agent.continue"), schema: z.strictObject({}) });
export const ConfigureAgent = defineAction(Agent, {
  id: builtin.name("agent.configure"), schema: z.strictObject({ selection: agentSelectionSchema }),
});
export const CancelAgent = defineAction(Agent, { id: builtin.name("agent.cancel"), schema: z.strictObject({}) });
