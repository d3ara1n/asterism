import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const shareMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  share: { id: "conversation.share.open", defaultMessage: "Share excerpt" },
  messages: { id: "conversation.share.messages", defaultMessage: "Messages" },
  preview: { id: "conversation.share.preview", defaultMessage: "Preview" },
  selected: { id: "conversation.share.selected", defaultMessage: "{count, plural, one {# selected} other {# selected}}" },
  width: { id: "conversation.share.width", defaultMessage: "Image width" },
  copyImage: { id: "conversation.share.copyImage", defaultMessage: "Copy image" },
  saveImage: { id: "conversation.share.saveImage", defaultMessage: "Save PNG" },
  copyMarkdown: { id: "conversation.share.copyMarkdown", defaultMessage: "Copy Markdown" },
  saveMarkdown: { id: "conversation.share.saveMarkdown", defaultMessage: "Save Markdown" },
  copied: { id: "conversation.share.copied", defaultMessage: "Copied" },
  saved: { id: "conversation.share.saved", defaultMessage: "Saved" },
  failed: { id: "conversation.share.failed", defaultMessage: "Excerpt could not be exported." },
  tooLarge: { id: "conversation.share.tooLarge", defaultMessage: "Image is too large. Select fewer messages or use Markdown." },
  selectMessages: { id: "conversation.share.selectMessages", defaultMessage: "Select messages" },
  earlierFailed: { id: "conversation.share.earlierFailed", defaultMessage: "Earlier messages could not be loaded." },
}));
