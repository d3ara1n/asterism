import type { ProviderInput } from "../../../shared/configuration";

export const modelProtocolLabels: Record<ProviderInput["protocol"], string> = {
  "openai-responses": "OpenAI Responses",
  "openai-chat": "OpenAI Chat Completions",
  anthropic: "Anthropic Messages",
};
