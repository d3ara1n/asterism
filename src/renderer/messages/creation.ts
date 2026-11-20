import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const creationMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  workbenchNotReady: {
    id: "creation.workbenchNotReady",
    defaultMessage: "The workbench is not ready. Try again.",
  },
  adding: {
    id: "creation.adding",
    defaultMessage: "Adding {running_label}…",
  },
  text: {
    id: "creation.input.text",
    defaultMessage: "Text",
  },
  dropUnsupported: { id: "creation.drop.unsupported", defaultMessage: "This content can’t be dropped onto the canvas" },
  dropPartiallyUnsupported: { id: "creation.drop.partiallyUnsupported", defaultMessage: "Some content can’t be dropped onto the canvas" },
  droppedFile: { id: "creation.drop.file", defaultMessage: "File" },
  droppedDirectory: { id: "creation.drop.directory", defaultMessage: "Folder" },
  droppedLink: { id: "creation.drop.link", defaultMessage: "Link" },
  droppedFileUnknownType: { id: "creation.drop.fileUnknownType", defaultMessage: "File · unknown MIME type" },
  addAs: {
    id: "creation.typeChoice.title",
    defaultMessage: "Add as…",
  },
  rememberType: {
    id: "creation.typeChoice.remember",
    defaultMessage: "Remember for this type",
  },
}));
