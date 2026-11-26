import { createOpenAI } from "@ai-sdk/openai";
import { compatibility, thinkingMappings } from "../compatibility.ts";
import { mappedEffort, withRequestEncoding } from "../request-encoding.ts";
import { bearerHeaders, type LanguageModelProtocol, type ProviderOptions } from "./contract.ts";
import { projectChatFiles } from "./openai-chat-files.ts";

/** Chat Completions has no native continuation data and no public reasoning input. */
export const openaiChat: LanguageModelProtocol = {
  id: "openai-chat",
  continuationFormat: "openai-chat/1",
  sdkReasoning: true,
  toolResultFiles: target => compatibility(target).has("toolFilesAsUserMessage") ? "user-message" : "content",
  createModel(target, connection) {
    const mappings = thinkingMappings(target);
    return withRequestEncoding(
      transport => createOpenAI({ ...connection, fetch: transport }).chat(target.model.modelId),
      connection.fetch,
      (body, level) => {
        if (level === null) return;
        const effort = mappedEffort(level, mappings);
        if (effort === null) delete body.reasoning_effort;
        else body.reasoning_effort = effort;
      },
      { projectPrompt: projectChatFiles },
    );
  },
  callOptions(_target, request): { system?: string; providerOptions: ProviderOptions } {
    if (request.purpose === "probe") return { providerOptions: {} };
    return { system: request.system, providerOptions: { openai: request.reasoning ? { reasoningEffort: request.reasoning } : {} } };
  },
  capture: () => ({}),
  restore: () => ({}),
  replay: () => ({}),
  replaysThinking: () => false,
  discoveryHeaders: bearerHeaders,
};
