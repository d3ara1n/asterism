import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const webProviderMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "webProviders.title", defaultMessage: "Web providers" },
  hint: { id: "webProviders.hint", defaultMessage: "Providers are tried from top to bottom. Fetch only tries providers matching the URL. On failure, the next eligible provider is tried. Drag or use the arrows to change priority." },
  reorder: { id: "webProviders.reorder", defaultMessage: "Drag to reorder {provider}" },
  moveUp: { id: "webProviders.moveUp", defaultMessage: "Move {provider} up" },
  moveDown: { id: "webProviders.moveDown", defaultMessage: "Move {provider} down" },
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
