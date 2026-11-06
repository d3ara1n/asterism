import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const agentsMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  overviewSummary: {
    id: "settings.agents.summary",
    defaultMessage: "Role prompts, models, and subagent settings",
  },
  agent: {
    id: "agents.label",
    defaultMessage: "Agent",
  },
  agents: {
    id: "agents.title",
    defaultMessage: "Agents",
  },
  summary: {
    id: "agents.summary",
    defaultMessage: "Shared definitions for every agent object. Changes apply from the next request.",
  },
  addAgent: {
    id: "agents.add",
    defaultMessage: "Add agent",
  },
  default: {
    id: "agents.default",
    defaultMessage: "Default",
  },
  noRole: {
    id: "agents.modelRole.unset",
    defaultMessage: "No role",
  },
  unavailableRole: {
    id: "agents.modelRole.unavailableStatus",
    defaultMessage: "Unavailable role",
  },
  enableAgent: {
    id: "agents.enable",
    defaultMessage: "Enable {agent_name}",
  },
  none: {
    id: "agents.modelRole.none",
    defaultMessage: "None",
  },
  unavailableRoleOption: {
    id: "agents.modelRole.unavailableOption",
    defaultMessage: "Unavailable role",
  },
  disabledSuffix: {
    id: "agents.modelRole.disabledSuffix",
    defaultMessage: " (disabled)",
  },
  internalSuffix: {
    id: "agents.modelRole.internalSuffix",
    defaultMessage: " (internal, not available to agents)",
  },
  newAgent: {
    id: "agents.new",
    defaultMessage: "New agent",
  },
  builtinAgent: {
    id: "agents.builtin",
    defaultMessage: "Built-in agent",
  },
  deleteTitle: {
    id: "agents.delete.title",
    defaultMessage: "Delete this agent?",
  },
  deleteBuiltinDescription: {
    id: "agents.delete.builtinDescription",
    defaultMessage: "“{current_name}” will be removed and will not come back on its own. Conversations using it fail on their next request.",
  },
  deleteDescription: {
    id: "agents.delete.description",
    defaultMessage: "“{current_name}” will be removed. Conversations using it fail on their next request.",
  },
  basics: {
    id: "agents.basics",
    defaultMessage: "Basics",
  },
  id: {
    id: "agents.id",
    defaultMessage: "ID",
  },
  description: {
    id: "agents.description",
    defaultMessage: "Description",
  },
  modelRoles: {
    id: "agents.modelRoles",
    defaultMessage: "Model roles",
  },
  defaultModelRole: {
    id: "agents.defaultModelRole",
    defaultMessage: "Default model role",
  },
  defaultModelRoleHint: {
    id: "agents.defaultModelRoleHint",
    defaultMessage: "When unset, the default role is used. Prefills the model when this agent is chosen; you can still pick another model per conversation.",
  },
  prompts: {
    id: "agents.prompts",
    defaultMessage: "Prompts",
  },
  systemPrompt: {
    id: "agents.rolePrompt",
    defaultMessage: "Role prompt",
  },
  systemPromptHint: {
    id: "agents.rolePromptHint",
    defaultMessage: "Shared by workbench agents and subagents. Leave blank to use the default prompt shown above.",
  },
  taskExamples: {
    id: "agents.taskExamples",
    defaultMessage: "Task examples",
  },
  example: {
    id: "agents.taskExamples.indexedLabel",
    defaultMessage: "Example {index___1}",
  },
  removeExample: {
    id: "agents.taskExamples.remove",
    defaultMessage: "Remove example",
  },
  addExample: {
    id: "agents.taskExamples.add",
    defaultMessage: "Add example",
  },
  subagent: {
    id: "agents.subagent.title",
    defaultMessage: "Subagent settings",
  },
  subagentHint: {
    id: "agents.subagent.summary",
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
    id: "agents.subagent.maximumRequests",
    defaultMessage: "Maximum requests",
  },
  maximumDuration: {
    id: "agents.subagent.maximumDuration",
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
