import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const modelCompatibilityMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  thinkingLevels: { id: "compatibility.customThinkingLevels.title", defaultMessage: "Custom thinking levels" },
  thinkingLevelsDescription: {
    id: "compatibility.customThinkingLevels.description",
    defaultMessage: "Map standard levels to upstream effort values. Does not change available levels, history or token budgets.",
  },
  thinkingLevel: {
    id: "compatibility.customThinkingLevels.effort.description",
    defaultMessage: "An upstream effort string, or null to omit effort. Unset uses the protocol default.",
  },
  thinkingBudgets: { id: "compatibility.customThinkingBudgets.title", defaultMessage: "Custom thinking budgets" },
  thinkingBudgetsDescription: {
    id: "compatibility.customThinkingBudgets.description",
    defaultMessage: "Use manual thinking instead of adaptive thinking for Messages requests. Empty settings use built-in budgets; specified levels override them in tokens.",
  },
  thinkingBudget: {
    id: "compatibility.customThinkingBudgets.budget.description",
    defaultMessage: "Thinking tokens for this level. Unset uses the built-in budget based on the total output cap.",
  },
  promptCaching: { id: "compatibility.messagesPromptCaching.title", defaultMessage: "Prompt caching" },
  promptCachingDescription: {
    id: "compatibility.messagesPromptCaching.description",
    defaultMessage: "Request prompt caching on Messages endpoints that support automatic caching.",
  },
  customUserAgent: { id: "compatibility.customUserAgent.title", defaultMessage: "Custom User-Agent" },
  customUserAgentDescription: {
    id: "compatibility.customUserAgent.description",
    defaultMessage: "Override the User-Agent header for model requests and connection tests.",
  },
  userAgent: {
    id: "compatibility.customUserAgent.header.description",
    defaultMessage: "HTTP client identity. Overrides the identity supplied by the caller.",
  },
  opencodeSession: { id: "compatibility.opencodeSession.title", defaultMessage: "OpenCode session header" },
  opencodeSessionDescription: {
    id: "compatibility.opencodeSession.description",
    defaultMessage: "Send a stable conversation ID in x-opencode-session. Standalone calls use a temporary ID.",
  },
  systemMessageInMessages: { id: "compatibility.systemMessageInMessages.title", defaultMessage: "System prompt in messages" },
  systemMessageInMessagesDescription: {
    id: "compatibility.systemMessageInMessages.description",
    defaultMessage: "Send the system prompt as the first system message instead of the instructions field.",
  },
  responsesReasoning: { id: "compatibility.responsesReasoning.title", defaultMessage: "Responses reasoning fields" },
  responsesReasoningDescription: {
    id: "compatibility.responsesReasoning.description",
    defaultMessage: "Adapt endpoint field shapes and accepted request parameters. Plain text, summaries and opaque continuation remain native capabilities.",
  },
  reasoningContent: { id: "compatibility.responsesReasoning.content.title", defaultMessage: "Reasoning content shape" },
  reasoningContentDescription: { id: "compatibility.responsesReasoning.content.description", defaultMessage: "Defaults to an array of reasoning_text parts." },
  encryptedReasoning: { id: "compatibility.responsesReasoning.encryptedContent.title", defaultMessage: "Request encrypted content" },
  encryptedReasoningDescription: {
    id: "compatibility.responsesReasoning.encryptedContent.description",
    defaultMessage: "Defaults to true. Disable when the endpoint does not accept reasoning.encrypted_content in include.",
  },
  reasoningSummary: { id: "compatibility.responsesReasoning.summary.title", defaultMessage: "Request a reasoning summary" },
  reasoningSummaryDescription: {
    id: "compatibility.responsesReasoning.summary.description",
    defaultMessage: "Defaults to true. Disable when the endpoint does not accept reasoning.summary.",
  },
  reasoningInputSummary: { id: "compatibility.responsesReasoning.requireInputSummary.title", defaultMessage: "Always include a history summary field" },
  reasoningInputSummaryDescription: {
    id: "compatibility.responsesReasoning.requireInputSummary.description",
    defaultMessage: "Send an empty summary for reasoning history items that have no summary.",
  },
  responsesOmitStoredItems: { id: "compatibility.responsesOmitStoredItems.title", defaultMessage: "Omit stored Responses item references" },
  responsesOmitStoredItemsDescription: {
    id: "compatibility.responsesOmitStoredItems.description",
    defaultMessage: "Strip stored item IDs and references from stateless history. Tool call IDs are preserved.",
  },
  toolFilesAsUserMessage: { id: "compatibility.toolFilesAsUserMessage.title", defaultMessage: "Tool files in a user message" },
  toolFilesAsUserMessageDescription: {
    id: "compatibility.toolFilesAsUserMessage.description",
    defaultMessage: "Send files from tool results in a following user message, with a reference in the tool result.",
  },
}));
