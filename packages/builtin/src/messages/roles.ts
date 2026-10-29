import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const rolesMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  title: {
    id: "rolesTitle",
    defaultMessage: "Roles",
  },
  overviewSummary: {
    id: "features_settings_SettingsPage_5",
    defaultMessage: "Reusable model roles",
  },
  model: {
    id: "features_configuration_RolesSettings_7",
    defaultMessage: "Model",
  },
  noModel: {
    id: "features_configuration_RolesSettings_8",
    defaultMessage: "Not set",
  },
  unavailableModel: {
    id: "features_configuration_RolesSettings_9",
    defaultMessage: "Unavailable model",
  },
  disabledSuffix: {
    id: "features_configuration_RolesSettings_10",
    defaultMessage: " (disabled)",
  },
  thinkingLevel: {
    id: "features_configuration_RolesSettings_11",
    defaultMessage: "Thinking level",
  },
  modelRole: {
    id: "features_configuration_RolesSettings_13",
    defaultMessage: "Model role",
  },
  modelRoles: {
    id: "features_configuration_RolesSettings_14",
    defaultMessage: "Model roles",
  },
  summary: {
    id: "features_configuration_RolesSettings_15",
    defaultMessage: "Default models and thinking levels for agents and features. Thinking uses the provider default when no level is set.",
  },
  addRole: {
    id: "features_configuration_RolesSettings_16",
    defaultMessage: "Add role",
  },
  internal: {
    id: "features_configuration_RolesSettings_17",
    defaultMessage: "Internal",
  },
  enableRole: {
    id: "features_configuration_RolesSettings_18",
    defaultMessage: "Enable {role_name}",
  },
  newRole: {
    id: "features_configuration_RolesSettings_19",
    defaultMessage: "New role",
  },
  builtinRole: {
    id: "features_configuration_RolesSettings_20",
    defaultMessage: "Built-in role",
  },
  deleteTitle: {
    id: "features_configuration_RolesSettings_21",
    defaultMessage: "Delete this role?",
  },
  deleteDescription: {
    id: "features_configuration_RolesSettings_22",
    defaultMessage: "“{current_name}” will be removed. Agents that reference it will fail until they choose another role.",
  },
  id: {
    id: "features_configuration_RolesSettings_23",
    defaultMessage: "ID",
  },
  purpose: {
    id: "features_configuration_RolesSettings_24",
    defaultMessage: "Purpose",
  },
  purposeHint: {
    id: "features_configuration_RolesSettings_25",
    defaultMessage: "Leave blank to use the built-in text.",
  },
  availableToAgents: {
    id: "features_configuration_RolesSettings_26",
    defaultMessage: "Available to agents",
  },
  availableToAgentsHint: {
    id: "features_configuration_RolesSettings_27",
    defaultMessage: "Agents may pick this role on their own. Internal features can use it either way.",
  },
  usedBy: {
    id: "features_configuration_RolesSettings_28",
    defaultMessage: "Used by",
  },
  agentsUsingRole: {
    id: "features_configuration_RolesSettings_29",
    defaultMessage: "Agents using this role",
  },
  fallback: {
    id: "features_configuration_RolesSettings_30",
    defaultMessage: "Fallback",
  },
  noAgentsUsingRole: {
    id: "features_configuration_RolesSettings_31",
    defaultMessage: "No agents reference this role.",
  },
  chooseModelHint: {
    id: "features_configuration_RolesSettings_32",
    defaultMessage: "Choose the model and thinking level in the list after saving.",
  },
}));
