import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const webProviderMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  title: { id: "webProviders.title", defaultMessage: "Web providers" },
  hint: { id: "webProviders.hint", defaultMessage: "Fetch uses the first matching connection in this order. The first enabled search connection is the search default." },
  add: { id: "webProviders.add", defaultMessage: "Add web provider" },
  edit: { id: "webProviders.edit", defaultMessage: "Web provider" },
  empty: { id: "webProviders.empty", defaultMessage: "Add a connection to search and retrieve web content." },
  type: { id: "webProviders.type", defaultMessage: "Provider type" },
  name: { id: "webProviders.name", defaultMessage: "Name" },
  id: { id: "webProviders.id", defaultMessage: "Connection ID" },
  baseUrl: { id: "webProviders.baseUrl", defaultMessage: "API base URL" },
  enabled: { id: "webProviders.enabled", defaultMessage: "Enabled" },
  settings: { id: "webProviders.settings", defaultMessage: "Provider settings" },
  up: { id: "webProviders.up", defaultMessage: "Move up" },
  down: { id: "webProviders.down", defaultMessage: "Move down" },
  remove: { id: "webProviders.remove", defaultMessage: "Delete web provider?" },
  removeHint: { id: "webProviders.removeHint", defaultMessage: "This connection and its saved credential will be removed." },
  keyLink: { id: "webProviders.keyLink", defaultMessage: "Get API key" },
  unavailable: { id: "webProviders.unavailable", defaultMessage: "Provider type unavailable" },
  search: { id: "webProviders.search", defaultMessage: "Search" },
  fetch: { id: "webProviders.fetch", defaultMessage: "Fetch" },
}));
