import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const messagingMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "messaging.title", defaultMessage: "Messaging providers" },
  hint: { id: "messaging.hint", defaultMessage: "Each messaging provider is an external identity, such as a Telegram Bot, used for external conversations." },
  add: { id: "messaging.add", defaultMessage: "Add messaging provider" },
  edit: { id: "messaging.edit", defaultMessage: "Messaging provider" },
  name: { id: "messaging.name", defaultMessage: "Name" },
  provider: { id: "messaging.provider", defaultMessage: "Platform" },
  enabled: { id: "messaging.enabled", defaultMessage: "Enabled" },
  restart: { id: "messaging.restart", defaultMessage: "Reconnect" },
  remove: { id: "messaging.remove", defaultMessage: "Delete messaging provider?" },
  removeHint: { id: "messaging.removeHint", defaultMessage: "Remove this messaging provider, its saved credentials, and the conversations it retained. Existing chat resources keep their references." },
  empty: { id: "messaging.empty", defaultMessage: "Add a messaging provider to use external conversations." },
  unavailable: { id: "messaging.unavailable", defaultMessage: "Platform unavailable" },
  disabled: { id: "messaging.disabled", defaultMessage: "Disabled" },
  connecting: { id: "messaging.connecting", defaultMessage: "Connecting" },
  connected: { id: "messaging.connected", defaultMessage: "Connected" },
  reconnecting: { id: "messaging.reconnecting", defaultMessage: "Reconnecting" },
  failed: { id: "messaging.failed", defaultMessage: "Connection failed" },
}));
