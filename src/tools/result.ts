import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { toolCompletionSchema, toolOutcomeSchema, type ToolInvocationInfo, type ToolOutcome } from "@atelier/sdk/contracts";
import type { CallResult } from "./contract.ts";

/** 只有非成功结局可以继承过程产出；预览不能隐式升级为成功结果。 */
export function resolveToolCompletion(result: CallResult, latest: Json = null) {
  if ((result.kind === "succeeded" || result.kind === "partial") && result.data === undefined) {
    throw new Error("A successful or partial tool result must explicitly provide final data.");
  }
  return toolCompletionSchema.parse({
    kind: result.kind, data: result.data === undefined ? latest : result.data,
    ...("error" in result ? { error: result.error } : {}),
    ...("message" in result ? { message: result.message } : {}),
  });
}

/** 终结只发生一次；模型投影与 GUI 数据同时固定，不再依赖活动对象。 */
export function finishToolResult(result: CallResult, info: ToolInvocationInfo = {}, latest: Json = null,
  toModel?: (data: Json) => Json): ToolOutcome {
  const completion = resolveToolCompletion(result, latest);
  let projected: Json;
  try {
    projected = completion.data === null && completion.kind !== "succeeded" && completion.kind !== "partial"
      ? null : jsonSchema.parse(toModel ? toModel(completion.data) : completion.data);
  } catch {
    // 已知执行结局不能因展示投影失败变成“执行失败”，也不绕过投影泄漏原始数据。
    projected = { kind: completion.kind, error: { code: "result_projection_failed", message: "The operation ended, but its output could not be prepared for the model. Do not repeat a write solely to recover this output." } };
  }
  const model = completion.kind === "succeeded" ? projected : {
    kind: completion.kind, data: projected,
    ...("error" in completion ? { error: completion.error } : { message: completion.message }),
  };
  return toolOutcomeSchema.parse({ ...completion, ...info, model });
}
