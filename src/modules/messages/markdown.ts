import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const markdownMessages = pluginNamespace("atelier.core").messages("en", defineMessages({
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
  markdownCopyTable: {
    id: "markdownCopyTable",
    defaultMessage: "Copy table",
  },
  markdownCopyCsv: {
    id: "markdownCopyCsv",
    defaultMessage: "Copy as CSV",
  },
  markdownCopyTsv: {
    id: "markdownCopyTsv",
    defaultMessage: "Copy as TSV",
  },
  markdownCopyMarkdown: {
    id: "markdownCopyMarkdown",
    defaultMessage: "Copy as Markdown",
  },
}));
