import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const commandsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "commands.title", defaultMessage: "Commands" },
  theme: { id: "commands.theme", defaultMessage: "Theme" },
  search: { id: "commands.search", defaultMessage: "Search commands…" },
  current: { id: "commands.current", defaultMessage: "Current" },
  empty: { id: "commands.empty", defaultMessage: "No results" },
  pluginFailed: { id: "commands.pluginFailed", defaultMessage: "Commands unavailable" },
}));
