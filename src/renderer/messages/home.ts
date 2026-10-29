import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const homeMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  homePrompt: { id: "homePrompt", defaultMessage: "What would you like to work on?" },
  noEntry: { id: "home.noEntry", defaultMessage: "Enable an Agent paradigm plugin to start new work." },
  chooseEntry: { id: "home.chooseEntry", defaultMessage: "Choose how to start new work." },
  entryUnavailable: { id: "home.entryUnavailable", defaultMessage: "Your selected entry is unavailable. Choose another entry in General settings." },
  entrySettings: { id: "home.entrySettings", defaultMessage: "Open General settings" },
  entryTitle: { id: "home.entryTitle", defaultMessage: "Session entry" },
  entrySummary: { id: "home.entrySummary", defaultMessage: "The plugin interface used to start work from Home." },
  entryFailed: { id: "home.entryFailed", defaultMessage: "{plugin_name} could not display its session entry." },
  retry: { id: "home.retry", defaultMessage: "Try again" },
}));
