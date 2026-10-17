import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const conversationMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  minimap: {
    id: "agent_conversation_minimap",
    defaultMessage: "Conversation navigation",
  },
  minimapMessage: {
    id: "agent_conversation_minimapMessage",
    defaultMessage: "Go to message {number}",
  },
  contextSummary: {
    id: "agent_conversation_contextSummary",
    defaultMessage: "Context compressed",
  },
  messagePlaceholder: {
    id: "agent_conversation_Composer_1",
    defaultMessage: "Message the agent",
  },
  draftPlaceholder: {
    id: "agent_conversation_Composer_2",
    defaultMessage: "Draft your next message…",
  },
  continuePlaceholder: {
    id: "agent_conversation_Composer_3",
    defaultMessage: "Continue the conversation…",
  },
  keyboardHint: {
    id: "agent_conversation_Composer_4",
    defaultMessage: "Enter to send · Shift + Enter for a new line",
  },
  stop: {
    id: "agent_conversation_Composer_5",
    defaultMessage: "Stop",
  },
  continue: {
    id: "agent_conversation_Composer_6",
    defaultMessage: "Continue",
  },
  working: {
    id: "agent_conversation_Conversation_1",
    defaultMessage: "Working",
  },
  ready: {
    id: "agent_conversation_Conversation_2",
    defaultMessage: "Ready",
  },
  workingHint: {
    id: "agent_conversation_Conversation_4",
    defaultMessage: "The agent is working…",
  },
  emptyHint: {
    id: "agent_conversation_Conversation_5",
    defaultMessage: "Send a message to begin.",
  },
  latestOutput: {
    id: "agent_conversation_Conversation_6",
    defaultMessage: "Latest output",
  },
  reload: {
    id: "agent_conversation_Conversation_7",
    defaultMessage: "Reload",
  },
  incomplete: {
    id: "agent_conversation_ConversationTimeline_4",
    defaultMessage: "Incomplete",
  },
  you: {
    id: "agent_conversation_ConversationTimeline_5",
    defaultMessage: "You",
  },
}));
