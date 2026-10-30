import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const agentsMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  overviewSummary: {
    id: "features_settings_SettingsPage_7",
    defaultMessage: "Prompts, models, and request limits",
  },
  agent: {
    id: "features_configuration_AgentsSettings_1",
    defaultMessage: "Agent",
  },
  agents: {
    id: "features_configuration_AgentsSettings_2",
    defaultMessage: "Agents",
  },
  summary: {
    id: "features_configuration_AgentsSettings_3",
    defaultMessage: "Shared definitions for every agent object. Changes apply from the next request.",
  },
  addAgent: {
    id: "features_configuration_AgentsSettings_4",
    defaultMessage: "Add agent",
  },
  default: {
    id: "features_configuration_AgentsSettings_5",
    defaultMessage: "Default",
  },
  noRole: {
    id: "features_configuration_AgentsSettings_6",
    defaultMessage: "No role",
  },
  unavailableRole: {
    id: "features_configuration_AgentsSettings_7",
    defaultMessage: "Unavailable role",
  },
  enableAgent: {
    id: "features_configuration_AgentsSettings_8",
    defaultMessage: "Enable {agent_name}",
  },
  none: {
    id: "features_configuration_AgentsSettings_11",
    defaultMessage: "None",
  },
  unavailableRoleOption: {
    id: "features_configuration_AgentsSettings_12",
    defaultMessage: "Unavailable role",
  },
  disabledSuffix: {
    id: "features_configuration_AgentsSettings_13",
    defaultMessage: " (disabled)",
  },
  internalSuffix: {
    id: "features_configuration_AgentsSettings_14",
    defaultMessage: " (internal, not available to agents)",
  },
  newAgent: {
    id: "features_configuration_AgentsSettings_17",
    defaultMessage: "New agent",
  },
  builtinAgent: {
    id: "features_configuration_AgentsSettings_18",
    defaultMessage: "Built-in agent",
  },
  deleteTitle: {
    id: "features_configuration_AgentsSettings_19",
    defaultMessage: "Delete this agent?",
  },
  deleteBuiltinDescription: {
    id: "features_configuration_AgentsSettings_20",
    defaultMessage: "“{current_name}” will be removed and will not come back on its own. Conversations using it fail on their next request.",
  },
  deleteDescription: {
    id: "features_configuration_AgentsSettings_21",
    defaultMessage: "“{current_name}” will be removed. Conversations using it fail on their next request.",
  },
  basics: {
    id: "features_configuration_AgentsSettings_22",
    defaultMessage: "Basics",
  },
  id: {
    id: "features_configuration_AgentsSettings_23",
    defaultMessage: "ID",
  },
  description: {
    id: "features_configuration_AgentsSettings_24",
    defaultMessage: "Description",
  },
  modelRoles: {
    id: "features_configuration_AgentsSettings_25",
    defaultMessage: "Model roles",
  },
  defaultModelRole: {
    id: "features_configuration_AgentsSettings_26",
    defaultMessage: "Default model role",
  },
  defaultModelRoleHint: {
    id: "features_configuration_AgentsSettings_27",
    defaultMessage: "When unset, the default role is used. Prefills the model when this agent is chosen; you can still pick another model per conversation.",
  },
  prompts: {
    id: "features_configuration_AgentsSettings_29",
    defaultMessage: "Prompts",
  },
  systemPrompt: {
    id: "features_configuration_AgentsSettings_30",
    defaultMessage: "System prompt",
  },
  systemPromptHint: {
    id: "features_configuration_AgentsSettings_31",
    defaultMessage: "Leave blank to use the built-in prompt shown above.",
  },
  taskExamples: {
    id: "features_configuration_AgentsSettings_33",
    defaultMessage: "Task examples",
  },
  example: {
    id: "features_configuration_AgentsSettings_34",
    defaultMessage: "Example {index___1}",
  },
  removeExample: {
    id: "features_configuration_AgentsSettings_35",
    defaultMessage: "Remove example",
  },
  addExample: {
    id: "features_configuration_AgentsSettings_36",
    defaultMessage: "Add example",
  },
  limits: {
    id: "features_configuration_AgentsSettings_56",
    defaultMessage: "Limits",
  },
  maximumRequests: {
    id: "features_configuration_AgentsSettings_59",
    defaultMessage: "Maximum requests per turn",
  },
  maximumRequestsPlaceholder: {
    id: "features_configuration_AgentsSettings_60",
    defaultMessage: "Runtime default (32)",
  },
}));
