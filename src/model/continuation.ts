import { jsonSchema, modelScope, type Json, type ModelSettings } from "../shared/model.ts";

// Full text, summaries, and native data encode separately; origin restrictions apply only to opaque continuation data.
export const aiSdkAdapterVersion = "ai-sdk-v7/4";

/** Retain only allowlisted native data, not complete SDK metadata or HTTP data. */
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

/** Origin limits native supplementary data reuse only; it does not determine whether public text can participate in requests. */
export function canReuseContinuation(source: { scope: string; adapter: string }, target: ModelSettings): boolean {
  return source.adapter === aiSdkAdapterVersion && source.scope === modelScope(target);
}

export function continuationForTarget(value: Json, source: { scope: string; adapter: string }, target: ModelSettings): Record<string, Record<string, Json>> {
  if (!canReuseContinuation(source, target)) return {};
  const namespace = target.provider.protocol === "anthropic" ? "anthropic" : "openai";
  const native = pickContinuation(value)[namespace];
  return native ? { [namespace]: native } : {};
}
