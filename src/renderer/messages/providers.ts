import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const providersMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  optional: { id: "provider.optional", defaultMessage: "Optional" },
  usage: { id: "providerUsage.selection", defaultMessage: "Usage query" },
  usageOff: { id: "providerUsage.off", defaultMessage: "Off" },
  usageMissing: { id: "providerUsage.missing", defaultMessage: "{id} (unavailable)" },
  usageRefresh: { id: "providerUsage.refresh", defaultMessage: "Refresh usage" },
  usageUpdated: { id: "providerUsage.updated", defaultMessage: "Updated {time} · Click to refresh" },
  usageResets: { id: "providerUsage.resets", defaultMessage: "Resets {time}" },
  usageWaiting: { id: "providerUsage.waiting", defaultMessage: "Updates with model responses" },
  usageEmpty: { id: "providerUsage.empty", defaultMessage: "No allowance reported" },
  usageCredential: { id: "providerUsage.credential", defaultMessage: "Save a valid API key to query usage." },
  usageAuthentication: { id: "providerUsage.authentication", defaultMessage: "The usage service rejected the credentials." },
  usageRateLimited: { id: "providerUsage.rateLimited", defaultMessage: "Usage queries are rate limited." },
  usageFailed: { id: "providerUsage.failed", defaultMessage: "Usage query failed." },
  fetchModels: { id: "discovery.fetch", defaultMessage: "Fetch models" },
  refreshModels: { id: "discovery.refresh", defaultMessage: "Refresh" },
  fetchingModels: { id: "discovery.fetching", defaultMessage: "Fetching models…" },
  discoveryHint: { id: "discovery.hint", defaultMessage: "Select models returned by this connection. Listing a model does not confirm your account can use it. You can still add models manually." },
  discoveryDefaults: { id: "discovery.defaults", defaultMessage: "Only information supplied by the provider is filled in. Missing settings use the manual creation defaults: reasoning and tool calls on, and token limits unset. After adding, fetch parameters from models.dev or edit them manually. Existing models are kept unchanged." },
  discoveryUnsupported: { id: "discovery.unsupported", defaultMessage: "The model list endpoint is unavailable. Check the Base URL or add models manually." },
  discoveryCancelled: { id: "discovery.cancelled", defaultMessage: "Model discovery cancelled." },
  discoveryChanged: { id: "discovery.changed", defaultMessage: "The connection changed or this list is no longer available. Refresh to fetch models again." },
  discoveryEmpty: { id: "discovery.empty", defaultMessage: "The provider returned an empty model list." },
  searchModels: { id: "discovery.search", defaultMessage: "Search models" },
  noMatchingModel: { id: "discovery.noMatch", defaultMessage: "No matching models." },
  modelAlreadyAdded: { id: "discovery.added", defaultMessage: "Added" },
  discoveredCount: { id: "discovery.count", defaultMessage: "{count, plural, one {# model found} other {# models found}}" },
  discoveredContext: { id: "discovery.context", defaultMessage: "Context window: {count} toks" },
  discoveryReasoning: { id: "discovery.reasoning", defaultMessage: "Provider reports reasoning support" },
  discoveryNoReasoning: { id: "discovery.noReasoning", defaultMessage: "Provider reports no reasoning support" },
  addSelectedModels: { id: "discovery.addSelected", defaultMessage: "Add selected ({count})" },
  modelsAdded: { id: "discovery.saved", defaultMessage: "{count, plural, one {# model added. Review it in model settings.} other {# models added. Review them in model settings.}}" },
  saveBeforeDiscovery: { id: "discovery.saveFirst", defaultMessage: "Save the connection before fetching models." },
  compatibility: { id: "compatibility.title", defaultMessage: "Compatibility" },
  providerCompatibilityHint: { id: "compatibility.providerHint", defaultMessage: "Applies to all models under this provider after saving." },
  modelCompatibilityHint: { id: "compatibility.modelHint", defaultMessage: "Provider settings apply automatically. Model settings replace the entire matching setting; removing an override restores the provider setting." },
  compatibilityFromProvider: { id: "compatibility.fromProvider", defaultMessage: "From provider" },
  compatibilityOverridden: { id: "compatibility.overridden", defaultMessage: "Overrides provider" },
  overrideCompatibility: { id: "compatibility.override", defaultMessage: "Override for this model" },
  restoreProviderCompatibility: { id: "compatibility.restoreProvider", defaultMessage: "Restore provider setting for {name}" },
  addCompatibility: {
    id: "compatibility.add",
    defaultMessage: "Add compatibility setting",
  },
  removeCompatibility: {
    id: "compatibility.remove",
    defaultMessage: "Remove {name}",
  },
  invalidSettings: {
    id: "provider.test.invalidSettings",
    defaultMessage: "Check the provider and model settings.",
  },
  saveApiKey: {
    id: "provider.test.credentialRequired",
    defaultMessage: "Save an API key for this provider.",
  },
  keyRejected: {
    id: "provider.test.keyRejected",
    defaultMessage: "The key was rejected. Replace it in the provider connection.",
  },
  modelUnavailable: {
    id: "provider.test.modelUnavailable",
    defaultMessage: "Check the server model ID, or whether your account can access it.",
  },
  rateLimited: {
    id: "provider.test.rateLimited",
    defaultMessage: "Rate limited or out of quota. Try again later.",
  },
  networkUnavailable: {
    id: "provider.test.networkUnavailable",
    defaultMessage: "Can''t reach the server. Check the Base URL and your network or proxy.",
  },
  timeout: {
    id: "provider.test.timeout",
    defaultMessage: "The server took too long. Try again.",
  },
  unexpectedResponse: {
    id: "provider.test.unexpectedResponse",
    defaultMessage: "Unexpected response. Check that the protocol matches the service.",
  },
  serverError: {
    id: "provider.test.serverError",
    defaultMessage: "The provider returned a server error. Try again later.",
  },
  testCancelled: {
    id: "provider.test.cancelled",
    defaultMessage: "Test cancelled.",
  },
  provider: {
    id: "provider.label",
    defaultMessage: "Model provider",
  },
  connections: {
    id: "provider.connections.title",
    defaultMessage: "Model providers",
  },
  summary: {
    id: "provider.connections.summary",
    defaultMessage: "Connections, credentials, and the models they provide.",
  },
  addProvider: {
    id: "provider.add.action",
    defaultMessage: "Add model provider",
  },
  emptyConnections: {
    id: "provider.connections.empty",
    defaultMessage: "Add a connection to start using models.",
  },
  addFirstProvider: {
    id: "provider.add.emptyAction",
    defaultMessage: "Add model provider",
  },
  modelCount: {
    id: "provider.modelCount",
    defaultMessage: "{count} models",
  },
  enableProvider: {
    id: "provider.enable",
    defaultMessage: "Enable {provider_name}",
  },
  presetHint: {
    id: "provider.add.presetHint",
    defaultMessage: "Choose a provider and add your credentials. Use a custom connection for a different endpoint or connection settings.",
  },
  payAsYouGo: { id: "providerPreset.payAsYouGo", defaultMessage: "Pay as you go" },
  subscription: { id: "providerPreset.subscription", defaultMessage: "Subscription" },
  noBilling: { id: "providerPreset.noBilling", defaultMessage: "No billing" },
  searchProviders: {
    id: "provider.add.search",
    defaultMessage: "Search model providers",
  },
  searchProvidersLabel: {
    id: "provider.add.searchLabel",
    defaultMessage: "Search model providers",
  },
  noMatchingProvider: {
    id: "provider.add.noMatch",
    defaultMessage: "No matching provider.",
  },
  customConnection: {
    id: "provider.add.customConnection",
    defaultMessage: "Custom connection",
  },
  customConnectionHint: {
    id: "provider.add.customConnectionHint",
    defaultMessage: "Any compatible endpoint, relay, or local server",
  },
  confirmAddProvider: {
    id: "provider.add.title",
    defaultMessage: "Add model provider",
  },
  model: {
    id: "provider.model.label",
    defaultMessage: "Model",
  },
  newProvider: {
    id: "provider.add.new",
    defaultMessage: "New model provider",
  },
  deleteProviderTitle: {
    id: "provider.delete.title",
    defaultMessage: "Delete this provider?",
  },
  deleteProviderDescription: {
    id: "provider.delete.description",
    defaultMessage: "“{current_name}” and its {models_length} models will be removed, including the saved key.",
  },
  connection: {
    id: "provider.connection.title",
    defaultMessage: "Connection",
  },
  displayName: {
    id: "provider.name",
    defaultMessage: "Display name",
  },
  providerId: {
    id: "provider.id.label",
    defaultMessage: "Provider ID",
  },
  providerIdHint: {
    id: "provider.id.hint",
    defaultMessage: "Slug that identifies this provider; no ''/'' or spaces. Generated from the name; it does not need to match anything upstream.",
  },
  protocol: {
    id: "provider.protocol",
    defaultMessage: "Protocol",
  },
  httpsRequired: {
    id: "provider.httpsRequired",
    defaultMessage: "API keys require HTTPS, except on localhost or a loopback address.",
  },
  authentication: {
    id: "provider.authentication.label",
    defaultMessage: "Authentication",
  },
  noAuthenticationOption: {
    id: "provider.authentication.none",
    defaultMessage: "None",
  },
  getKey: {
    id: "provider.credential.getKey",
    defaultMessage: "Get a key",
  },
  credentialCommandHint: {
    id: "provider.credential.commandHint",
    defaultMessage: "Enter a value or a command such as !rbw get openai-api-key.",
  },
  models: {
    id: "provider.models.title",
    defaultMessage: "Models",
  },
  addModel: {
    id: "provider.models.add",
    defaultMessage: "Add model",
  },
  emptyModels: {
    id: "provider.models.empty",
    defaultMessage: "Add the first model to use this provider.",
  },
  testing: {
    id: "provider.test.running",
    defaultMessage: "Testing…",
  },
  testConnected: {
    id: "provider.test.connected",
    defaultMessage: "Connected",
  },
  cancelTestRequest: {
    id: "model.test.quickCancel",
    defaultMessage: "Cancel",
  },
  test: {
    id: "model.test.quickAction",
    defaultMessage: "Test",
  },
  enableModel: {
    id: "model.enable",
    defaultMessage: "Enable {model_name}",
  },
  newModel: {
    id: "model.add.new",
    defaultMessage: "New model",
  },
  deleteModelTitle: {
    id: "model.delete.title",
    defaultMessage: "Delete this model?",
  },
  deleteUnusedModelDescription: {
    id: "model.delete.unusedDescription",
    defaultMessage: "“{current_name}” will be removed. No roles use it.",
  },
  modelDisplayName: {
    id: "model.name",
    defaultMessage: "Display name",
  },
  serverModelId: {
    id: "model.serverId.label",
    defaultMessage: "Server model ID",
  },
  serverModelIdHint: {
    id: "model.serverId.hint",
    defaultMessage: "Must match the model name used by the provider''s API; may contain ''/'', no spaces. Generated from the name.",
  },
  capabilities: {
    id: "model.capabilities",
    defaultMessage: "Capabilities",
  },
  reasoning: {
    id: "model.reasoning",
    defaultMessage: "Reasoning",
  },
  availableThinkingLevels: {
    id: "model.availableThinkingLevels",
    defaultMessage: "Available thinking levels",
  },
  thinkingLevelsHint: {
    id: "model.thinkingLevelsHint",
    defaultMessage: "Choose which thinking levels appear in conversations and model roles. Existing selections are sent even if they are not listed.",
  },
  noThinkingLevels: {
    id: "model.noThinkingLevels",
    defaultMessage: "No levels selected for the menus. Existing selections still apply; requests without a level use the provider default.",
  },
  toolCalls: {
    id: "model.toolCalls",
    defaultMessage: "Tool calls",
  },
  parameters: {
    id: "model.parameters",
    defaultMessage: "Parameters",
  },
  contextWindow: {
    id: "model.contextWindow",
    defaultMessage: "Context window",
  },
  temperature: {
    id: "model.temperature",
    defaultMessage: "Temperature",
  },
  maximumOutputTokens: {
    id: "model.maximumOutputTokens",
    defaultMessage: "Maximum output tokens",
  },
  connectionTest: {
    id: "model.test.title",
    defaultMessage: "Connection test",
  },
  cancelTest: {
    id: "model.test.cancel",
    defaultMessage: "Cancel test",
  },
  testConnection: {
    id: "model.test.action",
    defaultMessage: "Test connection",
  },
  testHint: {
    id: "model.test.hint",
    defaultMessage: "Sends a short request with the saved settings. Provider charges may apply.",
  },
  saveBeforeTest: {
    id: "model.test.saveFirst",
    defaultMessage: "Save first to test your changes.",
  },
}));
