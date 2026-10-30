import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const textMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  copyNoteMarkdown: {
    id: "note.copyMarkdown",
    defaultMessage: "Copy Markdown",
  },
  noteCopied: {
    id: "note.copied",
    defaultMessage: "Note copied",
  },
  noteCopyFailed: {
    id: "note.copyFailed",
    defaultMessage: "Could not copy note",
  },
  toolTextCharacters: {
    id: "toolTextCharacters",
    defaultMessage: "{count} chars",
  },
  toolTextEdits: {
    id: "toolTextEdits",
    defaultMessage: "{count, plural, one {# edit} other {# edits}}",
  },
  toolTextMatches: {
    id: "toolTextMatches",
    defaultMessage: "{count, plural, one {# match} other {# matches}}",
  },
  toolTextReplace: {
    id: "toolTextReplace",
    defaultMessage: "Replace text",
  },
  toolTextLiteral: {
    id: "toolTextLiteral",
    defaultMessage: "Literal text",
  },
  toolTextRegex: {
    id: "toolTextRegex",
    defaultMessage: "Regular expression",
  },
  toolTextFind: {
    id: "toolTextFind",
    defaultMessage: "Find",
  },
  toolTextReplacement: {
    id: "toolTextReplacement",
    defaultMessage: "Replace with",
  },
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
  toolTextPreviewOmitted: {
    id: "toolTextPreviewOmitted",
    defaultMessage: "{count, plural, one {# additional line is omitted from this preview.} other {# additional lines are omitted from this preview.}}",
  },
}));
