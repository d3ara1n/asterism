import { createOpenAI } from "@ai-sdk/openai";
import { ModelFailure } from "../contract.ts";
import { compatibility, thinkingMappings } from "../compatibility.ts";
import { mappedEffort, withThinkingEncoding } from "../thinking-options.ts";
import { bearerHeaders, type ModelProtocol, type ProviderOptions } from "./contract.ts";

/** Chat Completions has no native continuation data and no public reasoning input. */
export const openaiChat: ModelProtocol = {
  id: "openai-chat",
  continuationFormat: "openai-chat/1",
  sdkReasoning: true,
  // Validation admits tool-result files only with the explicit compatibility tag, which moves them to a following user message.
  toolResultFiles: () => "user-message",
  createModel(target, connection) {
    const mappings = thinkingMappings(target);
    return withThinkingEncoding(
      transport => createOpenAI({ ...connection, fetch: transport }).chat(target.model.modelId),
      connection.fetch,
      (body, level) => {
        const effort = mappedEffort(level, mappings);
        if (effort === null) delete body.reasoning_effort;
        else body.reasoning_effort = effort;
      },
    );
  },
  callOptions(_target, request): { system?: string; providerOptions: ProviderOptions } {
    if (request.purpose === "probe") return { providerOptions: {} };
    return { system: request.system, providerOptions: { openai: request.reasoning ? { reasoningEffort: request.reasoning } : {} } };
  },
  validate(input) {
    if (compatibility(input.settings).has("toolFilesAsUserMessage")) return;
    for (const item of input.messages) {
      if (item.kind !== "result") continue;
      const parts = "parts" in item ? item.parts : item.outcome.model;
      if (parts.some(part => part.kind === "file"))
        throw new ModelFailure("tool_files_unsupported", "Chat Completions cannot carry files in tool results. Add the 'Tool files in a user message' compatibility setting or choose another protocol.");
    }
  },
  capture: () => ({}),
  restore: () => ({}),
  replay: () => ({}),
  replaysThinking: () => false,
  discoveryHeaders: bearerHeaders,
};
