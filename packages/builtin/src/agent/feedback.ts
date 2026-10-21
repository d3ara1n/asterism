import { z } from "zod";
import { builtin } from "@atelier/builtin-api/contracts";

/** 当次执行反馈只交付在线界面，重连与重启保持真实历史。 */
export const AgentExecutionFeedback = builtin.event("agent.execution-feedback", {
  source: "resource",
  semantics: { kind: "occurrence" },
  schema: z.strictObject({ code: z.string(), message: z.string(), level: z.enum(["warning", "error"]) }),
});
