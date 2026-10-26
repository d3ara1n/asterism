import { defineMessages, pluginNamespace } from "@asterism/sdk/contracts";

export const errorDetailMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  view: { id: "error.details.view", defaultMessage: "View error details" },
  title: { id: "error.details.title", defaultMessage: "Error details" },
  body: { id: "error.details.body", defaultMessage: "Original response body" },
  raw: { id: "error.details.raw", defaultMessage: "Received response text" },
  diagnostic: { id: "error.details.diagnostic", defaultMessage: "Diagnostic information" },
  copy: { id: "error.details.copy", defaultMessage: "Copy error details" },
  copied: { id: "error.details.copied", defaultMessage: "Copied" },
  copyFailed: { id: "error.details.copyFailed", defaultMessage: "Could not copy error details." },
}));
