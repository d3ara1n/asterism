import { z } from "zod";
import { defineRecord } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

/**
 * 会话级命名事件：每次实际生效命名追加一条，既有事件不改写。
 * 自动命名附带触发消息、层级与生成模型，后续判断只读最新一条。
 */
export const SessionNamed = defineRecord(core.name("session.named"), {
  schema: z.strictObject({
    title: z.string().min(1).max(160),
    source: z.enum(["user", "auto"]),
    auto: z.strictObject({
      level: z.enum(["initial", "refined"]),
      messageId: z.string(),
      model: z.string(),
    }).optional(),
  }).refine(data => (data.source === "auto") === (data.auto !== undefined), "Only automatic names carry naming metadata."),
});
