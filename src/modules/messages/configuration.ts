import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const configurationMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  unavailableAgent: {
    id: "agent_conversation_ConfigurationPicker_1",
    defaultMessage: "Unavailable agent",
  },
  agentModelUnavailable: {
    id: "agent_conversation_ConfigurationPicker_2",
    defaultMessage: "This agent''s default model is unavailable. Select an available model or update settings.",
  },
  unavailableModel: {
    id: "agent_conversation_ConfigurationPicker_3",
    defaultMessage: "Unavailable model",
  },
  thinkingLevel: {
    id: "agent_conversation_ConfigurationPicker_4",
    defaultMessage: "Thinking level",
  },
  defaultModel: {
    id: "agent_conversation_ConfigurationPicker_5",
    defaultMessage: "Default",
  },
  thinkingOffOption: {
    id: "agent_conversation_ConfigurationPicker_6",
    defaultMessage: "Off",
  },
  defaultThinking: {
    id: "agent_conversation_ConfigurationPicker_7",
    defaultMessage: "Default",
  },
  nextRequestHint: {
    id: "agent_conversation_ConfigurationPicker_8",
    defaultMessage: "Changes apply to the next request",
  },
  thinkingOff: {
    id: "thinkingOff",
    defaultMessage: "Off",
  },
  thinkingMinimal: {
    id: "thinkingMinimal",
    defaultMessage: "Minimal",
  },
  thinkingLow: {
    id: "thinkingLow",
    defaultMessage: "Low",
  },
  thinkingMedium: {
    id: "thinkingMedium",
    defaultMessage: "Medium",
  },
  thinkingHigh: {
    id: "thinkingHigh",
    defaultMessage: "High",
  },
  thinkingXhigh: {
    id: "thinkingXhigh",
    defaultMessage: "Extra high",
  },
}));
