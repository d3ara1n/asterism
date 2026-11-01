import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const messagingMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "messaging.title", defaultMessage: "Messaging" },
  hint: { id: "messaging.hint", defaultMessage: "Configure the identities used to communicate through external conversations." },
  add: { id: "messaging.add", defaultMessage: "Add connection" },
  edit: { id: "messaging.edit", defaultMessage: "Messaging connection" },
  name: { id: "messaging.name", defaultMessage: "Connection name" },
  provider: { id: "messaging.provider", defaultMessage: "Provider" },
  enabled: { id: "messaging.enabled", defaultMessage: "Enabled" },
  restart: { id: "messaging.restart", defaultMessage: "Reconnect" },
  remove: { id: "messaging.remove", defaultMessage: "Delete connection?" },
  removeHint: { id: "messaging.removeHint", defaultMessage: "Remove this connection, its saved credentials, and the conversations its provider retained. Existing chat resources keep their references." },
  empty: { id: "messaging.empty", defaultMessage: "Add a messaging connection to use external conversations." },
  unavailable: { id: "messaging.unavailable", defaultMessage: "Provider unavailable" },
  disabled: { id: "messaging.disabled", defaultMessage: "Disabled" },
  connecting: { id: "messaging.connecting", defaultMessage: "Connecting" },
  connected: { id: "messaging.connected", defaultMessage: "Connected" },
  reconnecting: { id: "messaging.reconnecting", defaultMessage: "Reconnecting" },
  failed: { id: "messaging.failed", defaultMessage: "Connection failed" },
}));
