import type { LanguageModelProtocolId } from "@asterism-app/sdk/contracts";
import type { LanguageModelProtocol } from "./contract.ts";
import { anthropicMessages } from "./anthropic.ts";
import { openaiChat } from "./openai-chat.ts";
import { openaiResponses } from "./openai-responses.ts";

/** Host-owned protocol registry; plugins use host model services and cannot register protocols. */
const protocols: Record<LanguageModelProtocolId, LanguageModelProtocol> = {
  "openai-responses": openaiResponses,
  "openai-chat": openaiChat,
  anthropic: anthropicMessages,
};

export function languageModelProtocol(id: LanguageModelProtocolId): LanguageModelProtocol {
  return protocols[id];
}
export type { LanguageModelProtocol } from "./contract.ts";
