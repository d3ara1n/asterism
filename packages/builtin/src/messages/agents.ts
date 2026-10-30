import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const agentsMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  overviewSummary: {
    id: "features_settings_SettingsPage_7",
    defaultMessage: "Role prompts, models, and subagent settings",
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
    defaultMessage: "Role prompt",
  },
  systemPromptHint: {
    id: "features_configuration_AgentsSettings_31",
    defaultMessage: "Shared by workbench agents and subagents. Leave blank to use the default prompt shown above.",
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
  subagent: {
    id: "features_configuration_AgentsSettings_56",
    defaultMessage: "Subagent settings",
  },
  subagentHint: {
    id: "features_configuration_AgentsSettings_57",
    defaultMessage: "Additional instructions and execution limits for delegated tasks.",
  },
  subagentInstructions: {
    id: "agents.subagentInstructions",
    defaultMessage: "Additional instructions",
  },
  subagentInstructionsHint: {
    id: "agents.subagentInstructionsHint",
    defaultMessage: "Appended to the shared role prompt for subagents. Leave blank to use the default instructions shown above.",
  },
  maximumRequests: {
    id: "features_configuration_AgentsSettings_59",
    defaultMessage: "Maximum requests",
  },
  maximumDuration: {
    id: "features_configuration_AgentsSettings_61",
    defaultMessage: "Maximum duration (seconds)",
  },
  resourceAccess: { id: "agents.resourceAccess", defaultMessage: "Resource access" },
  resourceAccessMode: { id: "agents.resourceAccessMode", defaultMessage: "Access mode" },
  resourceAccessHint: { id: "agents.resourceAccessHint", defaultMessage: "Applies to workbench agents and subagents. Resources remain visible and inspectable; this setting controls tool calls on them." },
  resourcesAll: { id: "agents.resourcesAll", defaultMessage: "Unrestricted" },
  resourcesAllow: { id: "agents.resourcesAllow", defaultMessage: "Allowlist" },
  resourcesExclude: { id: "agents.resourcesExclude", defaultMessage: "Denylist" },
  allowedResourceTypes: { id: "agents.allowedResourceTypes", defaultMessage: "Allowed resource types" },
  excludedResourceTypes: { id: "agents.excludedResourceTypes", defaultMessage: "Denied resource types" },
  resourcesAllowHint: { id: "agents.resourcesAllowHint", defaultMessage: "Only selected types allow tool calls. An empty list denies all types." },
  resourcesExcludeHint: { id: "agents.resourcesExcludeHint", defaultMessage: "Selected types deny tool calls. An empty list allows all types." },
  chooseResourceTypes: { id: "agents.chooseResourceTypes", defaultMessage: "Select resource types" },
  searchResourceTypes: { id: "agents.searchResourceTypes", defaultMessage: "Search by name or ID…" },
  resourceSelected: { id: "agents.resourceSelected", defaultMessage: "Selected" },
  removeResourceType: { id: "agents.removeResourceType", defaultMessage: "Remove {name}" },
  delegation: { id: "agents.delegation", defaultMessage: "Delegation" },
  delegateTargets: { id: "agents.delegateTargets", defaultMessage: "Delegation targets" },
  delegatesHint: { id: "agents.delegatesHint", defaultMessage: "Controls which roles this agent can delegate to, both as a workbench agent and as a subagent." },
  delegatesAllowHint: { id: "agents.delegatesAllowHint", defaultMessage: "Only selected roles can receive delegated tasks. An empty allowlist disables delegation." },
  chooseDelegates: { id: "agents.chooseDelegates", defaultMessage: "Select agent roles" },
  searchDelegates: { id: "agents.searchDelegates", defaultMessage: "Search agent roles…" },
  removeDelegate: { id: "agents.removeDelegate", defaultMessage: "Remove {name}" },
}));
