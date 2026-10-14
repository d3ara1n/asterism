import { createHash } from "node:crypto";
import type { ModelPart } from "@atelier/sdk/contracts";
import type { ProviderInput, ProviderModel } from "../shared/configuration.ts";
import { ModelFailure, type ModelInput, type ModelValidationInput, type ResolvedModelItem } from "./contract.ts";
import { canReuseContinuation, continuationForTarget } from "./continuation.ts";

export function compatibilityForTarget(settings: {
  provider: Pick<ProviderInput, "protocol">; model: Pick<ProviderModel, "compatibility">;
}) {
  const has = (id: string) => settings.model.compatibility.some(entry => entry.id === id);
  // 协议编码器解释自己认识的行为；appliesTo 只用于展示，不参与匹配。
  return {
    systemMessage: settings.provider.protocol === "openai-responses" && has("systemMessageInMessages"),
    plainThinking: settings.provider.protocol === "openai-responses" && has("thinkingInDeepSeekFormat"),
    toolFiles: settings.provider.protocol === "openai-chat" && has("toolFilesAsUserMessage"),
  };
}

export function validateProjection(input: ModelValidationInput): void {
  if (input.settings.provider.protocol !== "openai-chat" || compatibilityForTarget(input.settings).toolFiles) return;
  for (const item of input.messages) {
    if (item.kind !== "result") continue;
    const parts = "parts" in item ? item.parts : item.outcome.model;
    if (parts.some(part => part.kind === "file")) {
      throw new ModelFailure("tool_files_unsupported", "Chat Completions cannot carry files in tool results. Add the 'Tool files in a user message' compatibility setting or choose another protocol.");
    }
  }
}

function portableCallId(seed: string): string {
  return `call_${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`;
}
const portableId = /^[A-Za-z0-9_-]{1,64}$/u;

/** 每次从不可变历史投影；原生资料不适用时只省略资料，不阻断公共上下文。 */
export function projectHistory(input: ModelInput): ResolvedModelItem[] {
  validateProjection(input);
  const { settings } = input;
  const compatibility = compatibilityForTarget(settings);
  const nativeIds = new Set(input.messages.flatMap(item => item.kind === "output" && canReuseContinuation(item, settings)
    ? item.parts.flatMap(part => part.kind === "toolcall" ? [part.callId] : []) : []));
  const usedIds = new Set<string>();
  const calls = new Map<string, string>();
  const projected: ResolvedModelItem[] = [];
  for (const [index, item] of input.messages.entries()) {
    if (item.kind === "result") {
      projected.push({ ...item, callId: calls.get(item.callId) ?? item.callId });
      continue;
    }
    if (item.kind !== "output") { projected.push(item); continue; }
    const native = canReuseContinuation(item, settings);
    const parts: ModelPart[] = [];
    for (const [partIndex, part] of item.parts.entries()) {
      const continuation = continuationForTarget(part.continuation, item, settings);
      if (part.kind === "toolcall") {
        // 本来源的原始调用 ID 优先保留；外来 ID 只在目标格式不接受或发生冲突时转换。
        const callId = native || (portableId.test(part.callId) && !nativeIds.has(part.callId) && !usedIds.has(part.callId))
          ? part.callId : portableCallId(JSON.stringify([item.scope, item.adapter, index, partIndex, part.callId]));
        calls.set(part.callId, callId);
        usedIds.add(callId);
        parts.push({ ...part, callId, continuation });
      } else if (part.kind === "text") {
        parts.push({ ...part, continuation });
      } else if (settings.model.capabilities.reasoning) {
        if (compatibility.plainThinking) {
          // 明文兼容只消费公共文字，不借用来源的 item ID、签名或密文。
          if (part.text) parts.push({ ...part, continuation: {} });
        } else if (settings.provider.protocol === "anthropic") {
          if (typeof continuation.anthropic?.signature === "string" || typeof continuation.anthropic?.redactedData === "string") {
            parts.push({ ...part, continuation });
          }
        } else if (settings.provider.protocol === "openai-responses") {
          // 基线固定 store:false，item ID 不能代替无状态续接所需的密文。
          if (typeof continuation.openai?.reasoningEncryptedContent === "string") {
            parts.push({ ...part, continuation });
          }
        }
        // 目标不能表达的无签名／无密文思考不伪装成正文；原文始终保留在时间线。
      }
    }
    if (parts.length) projected.push({ ...item, parts });
  }
  return projected;
}
