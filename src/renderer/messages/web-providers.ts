import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const webProviderMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  title: { id: "webProviders.title", defaultMessage: "Web providers" },
  hint: { id: "webProviders.hint", defaultMessage: "The first enabled search provider is used for web search. Providers are matched in order for URL fetch." },
  edit: { id: "webProviders.edit", defaultMessage: "Web provider" },
  add: { id: "webProviders.add", defaultMessage: "Add web provider" },
  empty: { id: "webProviders.empty", defaultMessage: "Add a provider to search and retrieve web content." },
  type: { id: "webProviders.type", defaultMessage: "Provider type" },
  enabled: { id: "webProviders.enabled", defaultMessage: "Enabled" },
  apiKey: { id: "webProviders.apiKey", defaultMessage: "API key" },
  apiKeySet: { id: "webProviders.apiKeySet", defaultMessage: "API key saved. Leave blank to keep it." },
  apiKeyEmpty: { id: "webProviders.apiKeyEmpty", defaultMessage: "Enter API key" },
  keyLink: { id: "webProviders.keyLink", defaultMessage: "Get API key" },
  remove: { id: "webProviders.remove", defaultMessage: "Delete web provider?" },
  removeHint: { id: "webProviders.removeHint", defaultMessage: "The saved credential will be removed. The provider can be re-added at any time." },
  unavailable: { id: "webProviders.unavailable", defaultMessage: "Provider type unavailable" },
  search: { id: "webProviders.search", defaultMessage: "Search" },
  fetch: { id: "webProviders.fetch", defaultMessage: "Fetch" },
}));
