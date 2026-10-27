import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const markdownMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  markdownImage: {
    id: "markdownImage",
    defaultMessage: "View image",
  },
  markdownCopied: {
    id: "markdownCopied",
    defaultMessage: "Copied",
  },
  markdownCopyCode: {
    id: "markdownCopyCode",
    defaultMessage: "Copy code",
  },
  markdownCopyFailed: {
    id: "markdownCopyFailed",
    defaultMessage: "Could not copy code",
  },
  markdownPlainText: {
    id: "markdownPlainText",
    defaultMessage: "Plain text",
  },
  markdownImageFailed: {
    id: "markdownImageFailed",
    defaultMessage: "Image could not be loaded. Open source",
  },
  markdownDiagram: {
    id: "markdownDiagram",
    defaultMessage: "Mermaid diagram",
  },
  markdownDiagramRendering: {
    id: "markdownDiagramRendering",
    defaultMessage: "Rendering diagram…",
  },
  markdownDiagramFailed: {
    id: "markdownDiagramFailed",
    defaultMessage: "Could not render this diagram. The source is shown below.",
  },
}));
