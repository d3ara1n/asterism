import { z } from "zod";
import { defineRecord } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

/** 代理用户消息的公开记录契约；需要识别用户输入的插件导入它。 */
export const UserMessage = defineRecord(core.name("agent.user-message"), {
  version: 1, schema: z.object({ agentId: z.string(), text: z.string() }),
});
