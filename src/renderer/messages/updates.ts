import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const updatesMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  title: { id: "updates.title", defaultMessage: "Software updates" },
  version: { id: "updates.version", defaultMessage: "Version {version}" },
  prerelease: { id: "updates.prerelease", defaultMessage: "Include prerelease versions" },
  prereleaseHint: { id: "updates.prereleaseHint", defaultMessage: "Get new features earlier. Prerelease versions may be less stable." },
  check: { id: "updates.check", defaultMessage: "Check for updates" },
  install: { id: "updates.install", defaultMessage: "Restart and install" },
  idle: { id: "updates.idle", defaultMessage: "Updates are checked when Asterism starts." },
  checking: { id: "updates.checking", defaultMessage: "Checking for updates…" },
  current: { id: "updates.current", defaultMessage: "You’re up to date." },
  downloading: { id: "updates.downloading", defaultMessage: "Downloading {version}… {percent}%" },
  ready: { id: "updates.ready", defaultMessage: "Version {version} is ready to install." },
  failed: { id: "updates.failed", defaultMessage: "The update could not be completed. Try checking again." },
  unavailable: { id: "updates.unavailable", defaultMessage: "Updates are available in the installed app." },
  loadFailed: { id: "updates.loadFailed", defaultMessage: "Update settings could not be loaded." },
  details: { id: "updates.details", defaultMessage: "Error details" },
  indicatorLabel: { id: "updates.indicatorLabel", defaultMessage: "Software updates: {status}" },
  versionChange: { id: "updates.versionChange", defaultMessage: "{current} → {next}" },
  installHint: { id: "updates.installHint", defaultMessage: "Restart Asterism to install the update." },
  settings: { id: "updates.settings", defaultMessage: "Update settings" },
}));
