import type { Json, ModelInputPart, ToolModelOutput } from "@asterism/sdk/contracts";
import { defaultToolModel, toolCompletionSchema, toolOutcomeSchema, type ToolInvocationInfo, type ToolOutcome } from "@asterism/sdk/contracts";
import type { CallResult } from "./contract.ts";

/** Only unsuccessful outcomes may inherit intermediate output; previews cannot implicitly become successful results. */
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

/** Declared projections may return parts; tool data is never interpreted as parts without a projection. */
function toolModelParts(output: ToolModelOutput): ModelInputPart[] {
  return typeof output === "string" ? [{ kind: "text", text: output }] : output;
}

/** Finalize once, fixing model projections and GUI data together without depending on active objects afterward. */
export function finishToolResult(result: CallResult, info: ToolInvocationInfo = {}, latest: Json = null,
  toModel?: (data: Json) => ToolModelOutput): ToolOutcome {
  const completion = resolveToolCompletion(result, latest);
  let projected: ModelInputPart[] | null;
  let projectionFailed = false;
  try {
    projected = completion.data === null && completion.kind !== "succeeded" && completion.kind !== "partial"
      ? null : toolModelParts(toModel ? toModel(completion.data) : defaultToolModel(completion.data));
  } catch {
    // Known execution outcomes cannot become execution failures due to presentation projection failure; do not bypass projections and leak raw data either.
    projected = null; projectionFailed = true;
  }
  const failure = projectionFailed ? "The operation ended. Model output preparation failed; the operation's recorded outcome remains authoritative." : null;
  if (completion.kind === "succeeded" && projected) return toolOutcomeSchema.parse({ ...completion, ...info, model: projected });
  // Unsuccessful outcomes describe status in text; files accompany successful or partially successful outcomes only.
  const status = "error" in completion ? `${completion.kind} (${completion.error.code}): ${completion.error.message}`
    : completion.kind === "succeeded" ? "succeeded" : `${completion.kind}: ${completion.message}`;
  const head: ModelInputPart = { kind: "text", text: failure ? `${status}\n${failure}` : status };
  const body = (projected ?? []).filter(part => completion.kind === "partial" || part.kind === "text");
  return toolOutcomeSchema.parse({ ...completion, ...info, model: [head, ...body] });
}
