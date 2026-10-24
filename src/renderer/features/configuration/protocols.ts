import type { ModelProviderInput } from "../../../shared/configuration";

export const modelProtocolLabels: Record<ModelProviderInput["protocol"], string> = {
  "openai-responses": "OpenAI Responses",
  "openai-chat": "OpenAI Chat Completions",
  anthropic: "Anthropic Messages",
};
