import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const shareMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  share: { id: "conversation.share.open", defaultMessage: "Share excerpt" },
  messages: { id: "conversation.share.messages", defaultMessage: "Messages" },
  preview: { id: "conversation.share.preview", defaultMessage: "Preview" },
  selected: { id: "conversation.share.selected", defaultMessage: "{count} of {total} selected" },
  selectAll: { id: "conversation.share.selectAll", defaultMessage: "Select all" },
  clearSelection: { id: "conversation.share.clearSelection", defaultMessage: "Clear" },
  width: { id: "conversation.share.width", defaultMessage: "Image width" },
  size: { id: "conversation.share.size", defaultMessage: "{width} × {height} px" },
  copyImage: { id: "conversation.share.copyImage", defaultMessage: "Copy image" },
  saveImage: { id: "conversation.share.saveImage", defaultMessage: "Save PNG" },
  markdown: { id: "conversation.share.markdown", defaultMessage: "Markdown" },
  copyMarkdown: { id: "conversation.share.copyMarkdown", defaultMessage: "Copy Markdown" },
  saveMarkdown: { id: "conversation.share.saveMarkdown", defaultMessage: "Save Markdown" },
  copied: { id: "conversation.share.copied", defaultMessage: "Copied" },
  saved: { id: "conversation.share.saved", defaultMessage: "Saved" },
  failed: { id: "conversation.share.failed", defaultMessage: "Excerpt could not be exported." },
  tooLarge: { id: "conversation.share.tooLarge", defaultMessage: "Too long for one image" },
  selectMessages: { id: "conversation.share.selectMessages", defaultMessage: "Select messages" },
  earlierFailed: { id: "conversation.share.earlierFailed", defaultMessage: "Earlier messages could not be loaded." },
}));
