import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const providersMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  disabled: {
    id: "features_configuration_ProvidersSettings_1",
    defaultMessage: "Disabled",
  },
  needsApiKey: {
    id: "features_configuration_ProvidersSettings_2",
    defaultMessage: "Needs API key",
  },
  noModels: {
    id: "features_configuration_ProvidersSettings_3",
    defaultMessage: "No models",
  },
  lastTestFailed: {
    id: "features_configuration_ProvidersSettings_4",
    defaultMessage: "Last test failed",
  },
  connected: {
    id: "features_configuration_ProvidersSettings_5",
    defaultMessage: "Connected",
  },
  notTested: {
    id: "features_configuration_ProvidersSettings_6",
    defaultMessage: "Not tested",
  },
  noAuthentication: {
    id: "features_configuration_ProvidersSettings_7",
    defaultMessage: "No authentication",
  },
  noKeySaved: {
    id: "features_configuration_ProvidersSettings_8",
    defaultMessage: "No key saved",
  },
  keySaved: {
    id: "features_configuration_ProvidersSettings_9",
    defaultMessage: "Saved securely",
  },
  credentialProtectionUnavailable: {
    id: "features_configuration_ProvidersSettings_10",
    defaultMessage: "System credential protection is unavailable",
  },
  decryptionFailed: {
    id: "features_configuration_ProvidersSettings_11",
    defaultMessage: "Decryption failed, enter it again",
  },
  invalidSettings: {
    id: "features_configuration_ProvidersSettings_12",
    defaultMessage: "Check the provider and model settings.",
  },
  saveApiKey: {
    id: "features_configuration_ProvidersSettings_13",
    defaultMessage: "Save an API key for this provider.",
  },
  keyRejected: {
    id: "features_configuration_ProvidersSettings_14",
    defaultMessage: "The key was rejected. Replace it in the provider connection.",
  },
  modelUnavailable: {
    id: "features_configuration_ProvidersSettings_15",
    defaultMessage: "Check the server model ID, or whether your account can access it.",
  },
  rateLimited: {
    id: "features_configuration_ProvidersSettings_16",
    defaultMessage: "Rate limited or out of quota. Try again later.",
  },
  networkUnavailable: {
    id: "features_configuration_ProvidersSettings_17",
    defaultMessage: "Can''t reach the server. Check the Base URL and your network or proxy.",
  },
  timeout: {
    id: "features_configuration_ProvidersSettings_18",
    defaultMessage: "The server took too long. Try again.",
  },
  unexpectedResponse: {
    id: "features_configuration_ProvidersSettings_19",
    defaultMessage: "Unexpected response. Check that the protocol matches the service.",
  },
  serverError: {
    id: "features_configuration_ProvidersSettings_20",
    defaultMessage: "The provider returned a server error. Try again later.",
  },
  testCancelled: {
    id: "features_configuration_ProvidersSettings_21",
    defaultMessage: "Test cancelled.",
  },
  provider: {
    id: "features_configuration_ProvidersSettings_22",
    defaultMessage: "Provider",
  },
  connections: {
    id: "features_configuration_ProvidersSettings_23",
    defaultMessage: "Connections",
  },
  summary: {
    id: "features_configuration_ProvidersSettings_24",
    defaultMessage: "Connections, credentials, and the models they provide.",
  },
  addProvider: {
    id: "features_configuration_ProvidersSettings_25",
    defaultMessage: "Add provider",
  },
  emptyConnections: {
    id: "features_configuration_ProvidersSettings_26",
    defaultMessage: "Add a connection to start using models.",
  },
  addFirstProvider: {
    id: "features_configuration_ProvidersSettings_27",
    defaultMessage: "Add provider",
  },
  modelCount: {
    id: "features_configuration_ProvidersSettings_28",
    defaultMessage: "{count} models",
  },
  enableProvider: {
    id: "features_configuration_ProvidersSettings_29",
    defaultMessage: "Enable {provider_name}",
  },
  official: {
    id: "features_configuration_ProvidersSettings_30",
    defaultMessage: "Official",
  },
  aggregators: {
    id: "features_configuration_ProvidersSettings_31",
    defaultMessage: "Aggregators",
  },
  local: {
    id: "features_configuration_ProvidersSettings_32",
    defaultMessage: "Local",
  },
  presetHint: {
    id: "features_configuration_ProvidersSettings_33",
    defaultMessage: "Pick a service to prefill its connection. You can change everything afterwards.",
  },
  searchProviders: {
    id: "features_configuration_ProvidersSettings_34",
    defaultMessage: "Search providers",
  },
  searchProvidersLabel: {
    id: "features_configuration_ProvidersSettings_35",
    defaultMessage: "Search providers",
  },
  noKeyNeeded: {
    id: "features_configuration_ProvidersSettings_36",
    defaultMessage: "No key needed",
  },
  noMatchingProvider: {
    id: "features_configuration_ProvidersSettings_37",
    defaultMessage: "No matching provider.",
  },
  customConnection: {
    id: "features_configuration_ProvidersSettings_38",
    defaultMessage: "Custom connection",
  },
  customConnectionHint: {
    id: "features_configuration_ProvidersSettings_39",
    defaultMessage: "Any compatible endpoint, relay, or local server",
  },
  confirmAddProvider: {
    id: "features_configuration_ProvidersSettings_40",
    defaultMessage: "Add provider",
  },
  model: {
    id: "features_configuration_ProvidersSettings_41",
    defaultMessage: "Model",
  },
  newProvider: {
    id: "features_configuration_ProvidersSettings_42",
    defaultMessage: "New provider",
  },
  customProvider: {
    id: "features_configuration_ProvidersSettings_43",
    defaultMessage: "Custom connection",
  },
  deleteProviderTitle: {
    id: "features_configuration_ProvidersSettings_44",
    defaultMessage: "Delete this provider?",
  },
  deleteProviderDescription: {
    id: "features_configuration_ProvidersSettings_45",
    defaultMessage: "“{current_name}” and its {models_length} models will be removed, including the saved key.",
  },
  changePreset: {
    id: "features_configuration_ProvidersSettings_46",
    defaultMessage: "Change preset",
  },
  connection: {
    id: "features_configuration_ProvidersSettings_47",
    defaultMessage: "Connection",
  },
  displayName: {
    id: "features_configuration_ProvidersSettings_48",
    defaultMessage: "Display name",
  },
  providerId: {
    id: "features_configuration_ProvidersSettings_49",
    defaultMessage: "Provider ID",
  },
  providerIdHint: {
    id: "features_configuration_ProvidersSettings_50",
    defaultMessage: "Slug that identifies this provider; no ''/'' or spaces. Generated from the name; it does not need to match anything upstream.",
  },
  protocol: {
    id: "features_configuration_ProvidersSettings_51",
    defaultMessage: "Protocol",
  },
  httpsRequired: {
    id: "features_configuration_ProvidersSettings_52",
    defaultMessage: "API keys require HTTPS, except on localhost or a loopback address.",
  },
  authentication: {
    id: "features_configuration_ProvidersSettings_53",
    defaultMessage: "Authentication",
  },
  noAuthenticationOption: {
    id: "features_configuration_ProvidersSettings_54",
    defaultMessage: "None (local service)",
  },
  getKey: {
    id: "features_configuration_ProvidersSettings_55",
    defaultMessage: "Get a key",
  },
  keepSavedKey: {
    id: "features_configuration_ProvidersSettings_56",
    defaultMessage: "Leave blank to keep the saved key",
  },
  pasteApiKey: {
    id: "features_configuration_ProvidersSettings_57",
    defaultMessage: "Paste API key",
  },
  keyRemovalHint: {
    id: "features_configuration_ProvidersSettings_58",
    defaultMessage: "The saved key will be removed when saved.",
  },
  keyStorageHint: {
    id: "features_configuration_ProvidersSettings_59",
    defaultMessage: "Stored with system encryption after saving.",
  },
  undo: {
    id: "features_configuration_ProvidersSettings_60",
    defaultMessage: "Undo",
  },
  removeSavedKey: {
    id: "features_configuration_ProvidersSettings_61",
    defaultMessage: "Remove saved key",
  },
  encryptionUnavailable: {
    id: "features_configuration_ProvidersSettings_62",
    defaultMessage: "System encryption is unavailable. API keys cannot be saved.",
  },
  models: {
    id: "features_configuration_ProvidersSettings_63",
    defaultMessage: "Models",
  },
  addModel: {
    id: "features_configuration_ProvidersSettings_64",
    defaultMessage: "Add model",
  },
  emptyModels: {
    id: "features_configuration_ProvidersSettings_65",
    defaultMessage: "Add the first model to use this provider.",
  },
  testing: {
    id: "features_configuration_ProvidersSettings_66",
    defaultMessage: "Testing…",
  },
  settingsChanged: {
    id: "features_configuration_ProvidersSettings_67",
    defaultMessage: "Settings changed, test again",
  },
  testConnected: {
    id: "features_configuration_ProvidersSettings_68",
    defaultMessage: "Connected",
  },
  cancelTestRequest: {
    id: "features_configuration_ProvidersSettings_69",
    defaultMessage: "Cancel",
  },
  test: {
    id: "features_configuration_ProvidersSettings_70",
    defaultMessage: "Test",
  },
  enableModel: {
    id: "features_configuration_ProvidersSettings_71",
    defaultMessage: "Enable {model_name}",
  },
  newModel: {
    id: "features_configuration_ProvidersSettings_72",
    defaultMessage: "New model",
  },
  deleteModelTitle: {
    id: "features_configuration_ProvidersSettings_73",
    defaultMessage: "Delete this model?",
  },
  deleteModelWithRolesDescription: {
    id: "features_configuration_ProvidersSettings_74",
    defaultMessage: "“{current_name}” will be removed. These roles will be unavailable until you choose another model: {roles}.",
  },
  deleteUnusedModelDescription: {
    id: "features_configuration_ProvidersSettings_75",
    defaultMessage: "“{current_name}” will be removed. No roles use it.",
  },
  modelDisplayName: {
    id: "features_configuration_ProvidersSettings_76",
    defaultMessage: "Display name",
  },
  serverModelId: {
    id: "features_configuration_ProvidersSettings_77",
    defaultMessage: "Server model ID",
  },
  serverModelIdHint: {
    id: "features_configuration_ProvidersSettings_78",
    defaultMessage: "Must match the model name used by the provider''s API; may contain ''/'', no spaces. Generated from the name.",
  },
  capabilities: {
    id: "features_configuration_ProvidersSettings_79",
    defaultMessage: "Capabilities",
  },
  reasoning: {
    id: "features_configuration_ProvidersSettings_80",
    defaultMessage: "Reasoning",
  },
  toolCalls: {
    id: "features_configuration_ProvidersSettings_81",
    defaultMessage: "Tool calls",
  },
  imageInput: {
    id: "features_configuration_ProvidersSettings_82",
    defaultMessage: "Image input",
  },
  usedBy: {
    id: "features_configuration_ProvidersSettings_83",
    defaultMessage: "Used by",
  },
  rolesUsingModel: {
    id: "features_configuration_ProvidersSettings_84",
    defaultMessage: "Roles using this model",
  },
  noRolesUsingModel: {
    id: "features_configuration_ProvidersSettings_85",
    defaultMessage: "No roles use this model.",
  },
  advanced: {
    id: "features_configuration_ProvidersSettings_86",
    defaultMessage: "Advanced",
  },
  contextWindow: {
    id: "features_configuration_ProvidersSettings_87",
    defaultMessage: "Context window",
  },
  temperature: {
    id: "features_configuration_ProvidersSettings_88",
    defaultMessage: "Temperature",
  },
  maximumOutputTokens: {
    id: "features_configuration_ProvidersSettings_89",
    defaultMessage: "Maximum output tokens",
  },
  connectionTest: {
    id: "features_configuration_ProvidersSettings_90",
    defaultMessage: "Connection test",
  },
  cancelTest: {
    id: "features_configuration_ProvidersSettings_91",
    defaultMessage: "Cancel test",
  },
  testConnection: {
    id: "features_configuration_ProvidersSettings_92",
    defaultMessage: "Test connection",
  },
  testHint: {
    id: "features_configuration_ProvidersSettings_93",
    defaultMessage: "Sends a short request with the saved settings. Provider charges may apply.",
  },
  saveBeforeTest: {
    id: "features_configuration_ProvidersSettings_94",
    defaultMessage: "Save first to test your changes.",
  },
}));
