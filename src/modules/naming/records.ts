import { z } from "zod";
import { defineRecord } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

/** 当前标题的来源凭真实生效事件判断；标题可更新，既有事件只追加不改写。 */
export const SessionNamed = defineRecord(core.name("session.named"), {
  schema: z.strictObject({
    title: z.string().min(1).max(160),
    source: z.enum(["user", "initial", "refined"]),
  }),
});

/** 一次已安排的自动命名尝试；重开不重试同一输入，较新的尝试使旧结果失效。 */
export const NamingAttempt = defineRecord(core.name("session.naming-attempt"), {
  schema: z.strictObject({
    messageId: z.string(),
    level: z.enum(["initial", "refined"]),
  }),
});
