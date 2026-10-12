import type { Json, ModelInputPart, ToolModelOutput } from "@atelier/sdk/contracts";
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

/** 文字只序列化一次：字符串原样成为文字部件，未声明投影的 data 以 JSON 文本交给模型。 */
function parts(output: ToolModelOutput | Json): ModelInputPart[] {
  if (typeof output === "string") return [{ kind: "text", text: output }];
  if (Array.isArray(output) && output.length && output.every(part => part && typeof part === "object" && "kind" in part))
    return output as ModelInputPart[];
  return [{ kind: "text", text: JSON.stringify(output) }];
}

/** 终结只发生一次；模型投影与 GUI 数据同时固定，不再依赖活动对象。 */
export function finishToolResult(result: CallResult, info: ToolInvocationInfo = {}, latest: Json = null,
  toModel?: (data: Json) => ToolModelOutput): ToolOutcome {
  const completion = resolveToolCompletion(result, latest);
  let projected: ModelInputPart[] | null;
  let projectionFailed = false;
  try {
    projected = completion.data === null && completion.kind !== "succeeded" && completion.kind !== "partial"
      ? null : parts(toModel ? toModel(completion.data) : completion.data);
  } catch {
    // 已知执行结局不能因展示投影失败变成“执行失败”，也不绕过投影泄漏原始数据。
    projected = null; projectionFailed = true;
  }
  const failure = projectionFailed ? "The operation ended, but its output could not be prepared for the model. Do not repeat a write solely to recover this output." : null;
  if (completion.kind === "succeeded" && projected) return toolOutcomeSchema.parse({ ...completion, ...info, model: projected });
  // 非成功结局以文字说明状态；文件只随成功或部分成功交付。
  const status = "error" in completion ? `${completion.kind} (${completion.error.code}): ${completion.error.message}`
    : completion.kind === "succeeded" ? "succeeded" : `${completion.kind}: ${completion.message}`;
  const head: ModelInputPart = { kind: "text", text: failure ? `${status}\n${failure}` : status };
  const body = (projected ?? []).filter(part => completion.kind === "partial" || part.kind === "text");
  return toolOutcomeSchema.parse({ ...completion, ...info, model: [head, ...body] });
}
