import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const rolesMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  title: {
    id: "roles.title",
    defaultMessage: "Roles",
  },
  overviewSummary: {
    id: "settings.roles.summary",
    defaultMessage: "Reusable model roles",
  },
  model: {
    id: "roles.model",
    defaultMessage: "Model",
  },
  noModel: {
    id: "roles.model.unset",
    defaultMessage: "Not set",
  },
  unavailableModel: {
    id: "roles.model.unavailable",
    defaultMessage: "Unavailable model",
  },
  disabledSuffix: {
    id: "roles.model.disabledSuffix",
    defaultMessage: " (disabled)",
  },
  thinkingLevel: {
    id: "roles.thinkingLevel",
    defaultMessage: "Thinking level",
  },
  modelRole: {
    id: "roles.editorTitle",
    defaultMessage: "Model role",
  },
  modelRoles: {
    id: "roles.listTitle",
    defaultMessage: "Model roles",
  },
  summary: {
    id: "roles.summary",
    defaultMessage: "Default models and thinking levels for agents and features. Thinking uses the provider default when no level is set.",
  },
  addRole: {
    id: "roles.add",
    defaultMessage: "Add role",
  },
  internal: {
    id: "roles.internal",
    defaultMessage: "Internal",
  },
  enableRole: {
    id: "roles.enable",
    defaultMessage: "Enable {role_name}",
  },
  newRole: {
    id: "roles.newRole",
    defaultMessage: "New role",
  },
  builtinRole: {
    id: "roles.builtinRole",
    defaultMessage: "Built-in role",
  },
  deleteTitle: {
    id: "roles.delete.title",
    defaultMessage: "Delete this role?",
  },
  deleteDescription: {
    id: "roles.delete.description",
    defaultMessage: "“{current_name}” will be removed. Agents that reference it will fail until they choose another role.",
  },
  id: {
    id: "roles.id",
    defaultMessage: "ID",
  },
  purpose: {
    id: "roles.purpose",
    defaultMessage: "Purpose",
  },
  purposeHint: {
    id: "roles.purposeHint",
    defaultMessage: "Leave blank to use the built-in text.",
  },
  availableToAgents: {
    id: "roles.availableToAgents",
    defaultMessage: "Available to agents",
  },
  availableToAgentsHint: {
    id: "roles.availableToAgentsHint",
    defaultMessage: "Agents may pick this role on their own. Internal features can use it either way.",
  },
  usedBy: {
    id: "roles.usedBy",
    defaultMessage: "Used by",
  },
  agentsUsingRole: {
    id: "roles.agentsUsingRole",
    defaultMessage: "Agents using this role",
  },
  fallback: {
    id: "roles.fallback",
    defaultMessage: "Fallback",
  },
  noAgentsUsingRole: {
    id: "roles.noAgentsUsingRole",
    defaultMessage: "No agents reference this role.",
  },
  chooseModelHint: {
    id: "roles.chooseModelHint",
    defaultMessage: "Choose the model and thinking level in the list after saving.",
  },
}));
