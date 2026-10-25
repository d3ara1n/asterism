import type { ModelProviderInput, ProviderModel, ThinkingLevel } from "../shared/configuration.ts";
import type { Json } from "../shared/model.ts";
import { ModelFailure } from "./contract.ts";
import { compatibilityForTarget } from "./projection.ts";

type Connection = Pick<ModelProviderInput, "protocol" | "compatibility">;
type RequestPurpose = { purpose: "probe" } | { purpose: "execution"; thinking: ThinkingLevel | null; system?: string; maxOutputTokens?: number };
interface RequestOptions {
  maxRetries: 0;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  reasoning?: Exclude<ThinkingLevel, "off"> | "none";
  providerOptions: Record<string, Record<string, Json>>;
}

/** 连接测试与执行的唯一请求选项解释入口；probe 只验证基础协议连通性。 */
export function requestOptions(provider: Connection, model: ProviderModel, request: RequestPurpose): RequestOptions {
  const options: RequestOptions = {
    maxRetries: 0,
    maxOutputTokens: model.generation.maxOutputTokens ?? undefined,
    temperature: model.generation.temperature ?? undefined,
    topP: model.generation.topP ?? undefined,
    providerOptions: provider.protocol === "openai-responses" ? { openai: { store: false } } : {},
  };
  if (request.purpose === "probe") {
    options.maxOutputTokens = Math.min(model.generation.maxOutputTokens ?? 64, 128);
    return options;
  }
  if (request.maxOutputTokens !== undefined) {
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
      throw new ModelFailure("invalid_argument", "The output token limit must be a positive safe integer.");
    options.maxOutputTokens = Math.min(options.maxOutputTokens ?? Infinity, request.maxOutputTokens);
  }
  const compatibility = compatibilityForTarget({ provider, model });
  if (provider.protocol !== "openai-responses" || compatibility.systemMessage) options.system = request.system;

  const { reasoning } = model.capabilities;
  const thinking = request.thinking;
  // 等级集合仅用于选择器；继承后的显式等级按协议编码，由上游判断是否接受。
  if (reasoning && thinking !== null) {
    options.reasoning = thinking === "off" ? "none" : thinking;
  }
  if (provider.protocol === "anthropic") return options;
  options.providerOptions = { openai: {
    ...(provider.protocol === "openai-responses" ? {
      // 显式 false 同样重要：否则 SDK 会按模型名自动请求加密思考。
      store: false, forceReasoning: reasoning,
      ...(reasoning && compatibility.encryptedContent ? { include: ["reasoning.encrypted_content"] } : {}),
      ...(reasoning && compatibility.reasoningSummary ? { reasoningSummary: "auto" } : {}),
      ...(compatibility.systemMessage ? { systemMessageMode: "system" }
        : request.system !== undefined ? { instructions: request.system } : {}),
    } : {}),
    ...(options.reasoning ? { reasoningEffort: options.reasoning } : {}),
  } };
  return options;
}
