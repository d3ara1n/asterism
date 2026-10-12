import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const creationMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  agentModelUnavailable: {
    id: "agent_creation_1",
    defaultMessage: "This agent’s default model configuration is unavailable. Select a model or update settings.",
  },
  chooseAgent: {
    id: "agent_creation_2",
    defaultMessage: "Choose agent",
  },
  chooseModel: {
    id: "agent_creation_3",
    defaultMessage: "Choose model",
  },
  addModel: {
    id: "agent_creation_4",
    defaultMessage: "Add a model in settings",
  },
  thinkingLevel: {
    id: "agent_creation_5",
    defaultMessage: "Thinking level",
  },
  thinkingOff: {
    id: "agent_creation_6",
    defaultMessage: "Off",
  },
  defaultThinking: {
    id: "agent_creation_7",
    defaultMessage: "Default",
  },
  defaultModel: {
    id: "agent_creation_8",
    defaultMessage: "Default",
  },
}));
