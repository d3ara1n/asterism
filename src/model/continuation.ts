import { jsonSchema, modelScope, type Json, type ModelSettings } from "../shared/model.ts";

// 全文、摘要与原生资料分别编码；来源限制只适用于不透明续接资料。
export const aiSdkAdapterVersion = "ai-sdk-v7/4";

/** 只保留白名单原生资料，不保存完整 SDK metadata 或 HTTP 数据。 */
export function pickContinuation(metadata: unknown): Record<string, Record<string, Json>> {
  const options: Record<string, Record<string, Json>> = {};
  if (!metadata || typeof metadata !== "object") return options;
  for (const [provider, keys] of Object.entries({ anthropic: ["signature", "redactedData"], openai: ["itemId", "reasoningEncryptedContent", "phase"] })) {
    const source = (metadata as Record<string, unknown>)[provider];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const picked: Record<string, Json> = {};
    for (const key of keys) {
      const value = (source as Record<string, unknown>)[key];
      if (value !== undefined) picked[key] = jsonSchema.parse(JSON.parse(JSON.stringify(value)));
    }
    if (Object.keys(picked).length) options[provider] = picked;
  }
  return options;
}

/** 来源只限制原生附加资料的复用，不决定公共正文是否能参与请求。 */
export function canReuseContinuation(source: { scope: string; adapter: string }, target: ModelSettings): boolean {
  return source.adapter === aiSdkAdapterVersion && source.scope === modelScope(target);
}

export function continuationForTarget(value: Json, source: { scope: string; adapter: string }, target: ModelSettings): Record<string, Record<string, Json>> {
  if (!canReuseContinuation(source, target)) return {};
  const namespace = target.provider.protocol === "anthropic" ? "anthropic" : "openai";
  const native = pickContinuation(value)[namespace];
  return native ? { [namespace]: native } : {};
}
