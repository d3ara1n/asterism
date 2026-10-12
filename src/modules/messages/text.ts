import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const textMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
  contentUnavailable: {
    id: "contentUnavailable",
    defaultMessage: "Saved content is unavailable.",
  },
  toolTextRead: {
    id: "toolTextRead",
    defaultMessage: "Read text",
  },
  toolTextEdit: {
    id: "toolTextEdit",
    defaultMessage: "Edit text",
  },
  toolTextWrite: {
    id: "toolTextWrite",
    defaultMessage: "Write text",
  },
  toolTextLines: {
    id: "toolTextLines",
    defaultMessage: "{shown} / {total} lines",
  },
  toolTextMore: {
    id: "toolTextMore",
    defaultMessage: "More content remains from line {line}.",
  },
  toolTextNoFinalNewline: {
    id: "toolTextNoFinalNewline",
    defaultMessage: "No trailing newline.",
  },
  toolTextUnchanged: {
    id: "toolTextUnchanged",
    defaultMessage: "Content is unchanged.",
  },
}));
