import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const messagingMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "messaging.title", defaultMessage: "Messaging connections" },
  hint: { id: "messaging.hint", defaultMessage: "Each connection is an external identity, such as a Telegram Bot, used for external conversations." },
  add: { id: "messaging.add", defaultMessage: "Add messaging connection" },
  choosePlatform: { id: "messaging.choosePlatform", defaultMessage: "Choose a platform for this connection." },
  noPlatforms: { id: "messaging.noPlatforms", defaultMessage: "No messaging platforms are available." },
  addForPlatform: { id: "messaging.addForPlatform", defaultMessage: "Add {platform} connection" },
  edit: { id: "messaging.edit", defaultMessage: "Messaging connection" },
  name: { id: "messaging.name", defaultMessage: "Name" },
  enabled: { id: "messaging.enabled", defaultMessage: "Enabled" },
  restart: { id: "messaging.restart", defaultMessage: "Reconnect" },
  remove: { id: "messaging.remove", defaultMessage: "Delete messaging connection?" },
  removeHint: { id: "messaging.removeHint", defaultMessage: "Remove this connection, its saved credentials, and the conversations it retained. Existing chat resources keep their references." },
  empty: { id: "messaging.empty", defaultMessage: "Add a messaging connection to use external conversations." },
  unavailable: { id: "messaging.unavailable", defaultMessage: "Platform unavailable" },
  disabled: { id: "messaging.disabled", defaultMessage: "Disabled" },
  connecting: { id: "messaging.connecting", defaultMessage: "Connecting" },
  connected: { id: "messaging.connected", defaultMessage: "Connected" },
  reconnecting: { id: "messaging.reconnecting", defaultMessage: "Reconnecting" },
  failed: { id: "messaging.failed", defaultMessage: "Connection failed" },
}));
