import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { ThinkingLevel } from "@asterism-app/sdk/contracts";
import type { ModelProviderInput, ProviderModel } from "../shared/configuration.ts";
import { mergeModelCompatibility, type CustomThinkingLevels, type CustomThinkingBudgets } from "../shared/model-compatibility.ts";
import { ModelFailure } from "./contract.ts";

type Model = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["model"];
type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]["params"];
type ActiveLevel = Exclude<ThinkingLevel, "off">;
type Body = Record<string, unknown>;
interface ThinkingMappings { levels: CustomThinkingLevels; budgets: CustomThinkingBudgets }

/** Allocate manual budgets against the final total output limit, with a minimum of 1024; explicit overrides are always absolute token counts. */
const budgetRatios: Record<ActiveLevel, number> = {
  minimal: 0.02, low: 0.1, medium: 0.3, high: 0.6, xhigh: 0.9, max: 0.95,
};
const defaultManualOutputTokens = 4096;

function object(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ModelFailure("protocol_encoding", "The thinking encoder received an invalid request object.");
  return value as Body;
}

/** Modify only named protocol fields; retain summaries, structured output, and other parameters in the same object. */
function setEffort(body: Body, field: "reasoning" | "output_config", effort: string | null) {
  const values = body[field] === undefined ? {} : { ...object(body[field]) };
  if (effort === null) delete values.effort;
  else values.effort = effort;
  if (Object.keys(values).length) body[field] = values;
  else delete body[field];
}

function resolveEffort(protocol: ModelProviderInput["protocol"], level: ThinkingLevel, override: string | null | undefined) {
  if (override !== undefined) return override;
  if (level === "off") return "none";
  return protocol === "anthropic" && level === "minimal" ? "low" : level;
}

function encodeAnthropicThinking(body: Body, level: ThinkingLevel, maxOutputTokens: number | undefined, mappings: ThinkingMappings) {
  const customEffort = mappings.levels[level];
  if (level === "off") {
    // Do not accept SDK replacement of off with low effort or between_tools; unsupported endpoints reject it themselves.
    body.thinking = { type: "disabled" };
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  const thinking = body.thinking === undefined ? undefined : object(body.thinking);
  if (thinking?.type === "enabled") {
    // Do not infer limits from max_tokens after the SDK adds budgets; the host fixes defaults too.
    const limit = maxOutputTokens ?? defaultManualOutputTokens;
    const budget = mappings.budgets[level] ?? Math.max(1024, Math.floor(limit * budgetRatios[level]));
    if (!Number.isSafeInteger(budget) || budget < 1024 || budget >= limit)
      throw new ModelFailure("thinking_budget_unavailable", "The thinking budget must be at least 1024 tokens and smaller than the output token limit. Adjust the budget or output limit.");
    body.thinking = { ...thinking, budget_tokens: budget };
    // The SDK adds reasoning budgets to max_tokens; Asterism's limit includes reasoning and must not expand.
    body.max_tokens = limit;
    // Manual budgets do not require effort; attach it only with explicit mappings for endpoints supporting both.
    setEffort(body, "output_config", customEffort ?? null);
    return;
  }

  if (thinking !== undefined && thinking.type !== "adaptive" && thinking.type !== "between_tools")
    throw new ModelFailure("protocol_encoding", "The Messages encoder returned an unsupported thinking mode.");
  setEffort(body, "output_config", resolveEffort("anthropic", level, customEffort));
  if (maxOutputTokens !== undefined) body.max_tokens = maxOutputTokens;
}

/**
 * The SDK still identifies Anthropic model reasoning modes; Asterism owns effort and manual-budget mappings.
 * Each call independently captures options and transport without shared mutable state linking concurrent requests.
 */
export function withThinkingOptions(
  createModel: (transport: typeof fetch) => Model, transport: typeof fetch,
  provider: Pick<ModelProviderInput, "protocol" | "compatibility">, model: Pick<ProviderModel, "compatibility">,
) {
  const entries = mergeModelCompatibility(provider.compatibility, model.compatibility);
  const levelsEntry = entries.find(entry => entry.id === "customThinkingLevels");
  const budgetsEntry = entries.find(entry => entry.id === "customThinkingBudgets");
  const mappings: ThinkingMappings = {
    levels: { ...(levelsEntry && "value" in levelsEntry ? levelsEntry.value : {}) as CustomThinkingLevels },
    budgets: { ...(budgetsEntry && "value" in budgetsEntry ? budgetsEntry.value : {}) as CustomThinkingBudgets },
  };
  const protocol = provider.protocol;

  const project = (params: CallOptions) => {
    // Probes, disabled reasoning, and unset levels use SDK defaults without consuming level or budget mappings.
    if (params.reasoning === undefined || params.reasoning === "provider-default") return null;
    const level: ThinkingLevel = params.reasoning === "none" ? "off" : params.reasoning;
    const effort = resolveEffort(protocol, level, mappings.levels[level]);
    const wireFetch: typeof fetch = (url, init) => {
      if (typeof init?.body !== "string")
        throw new ModelFailure("protocol_encoding", "The thinking encoder requires a serialized request body.");
      const body = object(JSON.parse(init.body));
      if (protocol === "openai-responses") setEffort(body, "reasoning", effort);
      else if (protocol === "openai-chat") {
        if (effort === null) delete body.reasoning_effort;
        else body.reasoning_effort = effort;
      } else encodeAnthropicThinking(body, level, params.maxOutputTokens, mappings);
      return transport(url, { ...init, body: JSON.stringify(body) });
    };
    return createModel(wireFetch);
  };
  return wrapLanguageModel({ model: createModel(transport), middleware: {
    specificationVersion: "v4",
    wrapStream: ({ params, doStream }) => {
      const target = project(params);
      return target ? target.doStream(params) : doStream();
    },
    wrapGenerate: ({ params, doGenerate }) => {
      const target = project(params);
      return target ? target.doGenerate(params) : doGenerate();
    },
  } });
}
