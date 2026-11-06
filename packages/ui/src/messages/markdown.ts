import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const markdownMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  markdownFootnotes: { id: "markdown.footnotes.label", defaultMessage: "Footnotes" },
  markdownFootnoteBack: { id: "markdown.footnotes.backReference", defaultMessage: "Back to reference" },
  markdownImage: {
    id: "markdown.image.view",
    defaultMessage: "View image",
  },
  markdownCopied: {
    id: "markdown.code.copied",
    defaultMessage: "Copied",
  },
  markdownCopyCode: {
    id: "markdown.code.copy",
    defaultMessage: "Copy code",
  },
  markdownCopyFailed: {
    id: "markdown.code.copyFailed",
    defaultMessage: "Could not copy code",
  },
  markdownPlainText: {
    id: "markdown.code.plainText",
    defaultMessage: "Plain text",
  },
  markdownImageFailed: {
    id: "markdown.image.loadFailed",
    defaultMessage: "Image could not be loaded. Open source",
  },
  markdownDiagram: {
    id: "markdown.diagram.label",
    defaultMessage: "Mermaid diagram",
  },
  markdownDiagramRendering: {
    id: "markdown.diagram.rendering",
    defaultMessage: "Rendering diagram…",
  },
  markdownDiagramFailed: {
    id: "markdown.diagram.renderFailed",
    defaultMessage: "Could not render this diagram. The source is shown below.",
  },
}));
