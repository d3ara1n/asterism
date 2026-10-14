import type { ProviderInput, ProviderModel, ThinkingLevel } from "../shared/configuration.ts";
import type { Json } from "../shared/model.ts";
import { ModelFailure } from "./contract.ts";

type Connection = Pick<ProviderInput, "protocol" | "baseUrl">;
type RequestPurpose = { purpose: "probe" } | { purpose: "execution"; thinking: ThinkingLevel | null };
interface RequestOptions {
  maxRetries: 0;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  reasoning?: Exclude<ThinkingLevel, "off"> | "none";
  providerOptions: Record<string, Record<string, Json>>;
}

export function usesPlainResponseReasoning(provider: Connection): boolean {
  return provider.protocol === "openai-responses" && new URL(provider.baseUrl).hostname === "api.deepseek.com";
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

  const { reasoning, thinkingLevels } = model.capabilities;
  const thinking = request.thinking;
  // 所有继承已经完成；关闭思考能力时，等级不参与校验或编码。
  if (reasoning) {
    if (thinking === null || !thinkingLevels.includes(thinking)) {
      throw new ModelFailure("thinking_unavailable", "The thinking level is unavailable for this model. Choose an enabled thinking level or update the role configuration.");
    }
    options.reasoning = thinking === "off" ? "none" : thinking;
  }
  if (provider.protocol === "anthropic") return options;
  options.providerOptions = { openai: {
    ...(provider.protocol === "openai-responses" ? {
      // 显式 false 同样重要：否则 SDK 会按模型名自动请求加密思考。
      store: false, forceReasoning: reasoning,
      ...(reasoning ? { include: ["reasoning.encrypted_content"], reasoningSummary: "auto" } : {}),
      // DeepSeek 把 developer 视为 user，系统指令需保留 system 身份。
      ...(usesPlainResponseReasoning(provider) ? { systemMessageMode: "system" } : {}),
    } : {}),
    ...(options.reasoning ? { reasoningEffort: options.reasoning } : {}),
  } };
  return options;
}
