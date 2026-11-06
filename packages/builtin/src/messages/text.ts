import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const textMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  editNote: {
    id: "note.edit",
    defaultMessage: "Edit note",
  },
  noteOpenFailed: {
    id: "note.openFailed",
    defaultMessage: "Could not open note",
  },
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
    id: "tools.text.characters",
    defaultMessage: "{count} chars",
  },
  toolTextEdits: {
    id: "tools.text.edits",
    defaultMessage: "{count, plural, one {# edit} other {# edits}}",
  },
  toolTextMatches: {
    id: "tools.text.matches",
    defaultMessage: "{count, plural, one {# match} other {# matches}}",
  },
  toolTextReplace: {
    id: "tools.text.replace",
    defaultMessage: "Replace text",
  },
  toolTextLiteral: {
    id: "tools.text.literal",
    defaultMessage: "Literal text",
  },
  toolTextRegex: {
    id: "tools.text.regex",
    defaultMessage: "Regular expression",
  },
  toolTextFind: {
    id: "tools.text.find",
    defaultMessage: "Find",
  },
  toolTextReplacement: {
    id: "tools.text.replacement",
    defaultMessage: "Replace with",
  },
  contentUnavailable: {
    id: "note.contentUnavailable",
    defaultMessage: "Saved content is unavailable.",
  },
  toolTextRead: {
    id: "tools.text.read",
    defaultMessage: "Read text",
  },
  toolTextEdit: {
    id: "tools.text.edit",
    defaultMessage: "Edit text",
  },
  toolTextWrite: {
    id: "tools.text.write",
    defaultMessage: "Write text",
  },
  toolTextLines: {
    id: "tools.text.lines",
    defaultMessage: "{shown} / {total} lines",
  },
  toolTextMore: {
    id: "tools.text.continuation",
    defaultMessage: "More content remains from line {line}.",
  },
  toolTextNoFinalNewline: {
    id: "tools.text.noFinalNewline",
    defaultMessage: "No trailing newline.",
  },
  toolTextUnchanged: {
    id: "tools.text.unchanged",
    defaultMessage: "Content is unchanged.",
  },
  toolTextPreviewOmitted: {
    id: "tools.text.previewOmitted",
    defaultMessage: "{count, plural, one {# additional line is omitted from this preview.} other {# additional lines are omitted from this preview.}}",
  },
}));
