import type { ModelProtocolId } from "@asterism-app/sdk/contracts";
import type { ModelProtocol } from "./contract.ts";
import { anthropicMessages } from "./anthropic.ts";
import { openaiChat } from "./openai-chat.ts";
import { openaiResponses } from "./openai-responses.ts";

/** Host-owned protocol registry; plugins use host model services and cannot register protocols. */
const protocols: Record<ModelProtocolId, ModelProtocol> = {
  "openai-responses": openaiResponses,
  "openai-chat": openaiChat,
  anthropic: anthropicMessages,
};

export function modelProtocol(id: ModelProtocolId): ModelProtocol {
  return protocols[id];
}
export type { ModelProtocol } from "./contract.ts";
