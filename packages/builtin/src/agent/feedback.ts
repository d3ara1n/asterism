import { z } from "zod";
import { builtin } from "@asterism/builtin-api/contracts";
import { errorDetailsSchema } from "@asterism/sdk/contracts";

export const agentFeedbackSchema = z.strictObject({
  origin: z.enum(["model", "software"]), code: z.string(), message: z.string(),
  level: z.enum(["warning", "error"]), details: errorDetailsSchema.optional(),
});
export type AgentFeedback = z.infer<typeof agentFeedbackSchema>;
export const inlineFeedbackSchema = agentFeedbackSchema.extend({
  id: z.string(), afterNodeId: z.string().nullable(),
});
export type InlineFeedback = z.infer<typeof inlineFeedbackSchema>;

/** 压缩活动属于运行时反馈；成功后由持久摘要记录承接。 */
export const compressionActivitySchema = z.strictObject({
  id: z.string(), afterNodeId: z.string().nullable(),
  status: z.enum(["running", "failed", "cancelled"]),
});
export type CompressionActivity = z.infer<typeof compressionActivitySchema>;

/** 软件故障通过在线通知交付；模型反馈由 Agent 的内存投影交付。 */
export const AgentSoftwareFeedback = builtin.event("agent.software-feedback", {
  source: "resource",
  semantics: { kind: "occurrence" },
  schema: agentFeedbackSchema,
});

/** 模型适配器显式标注来源，其余本地异常属于软件处理失败。 */
export function feedbackOrigin(error: unknown): AgentFeedback["origin"] {
  return error && typeof error === "object" && "origin" in error && error.origin === "model" ? "model" : "software";
}
