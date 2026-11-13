import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const mediaMessages = builtin.messages("en", defineMessages({
  save: { id: "media.file.save", defaultMessage: "Save file" },
  saveAs: { id: "media.file.saveAs", defaultMessage: "Save as…" },
  saved: { id: "media.file.saved", defaultMessage: "Saved {name}" },
  preview: { id: "media.image.preview", defaultMessage: "Preview image" },
  saveFailed: { id: "media.file.saveFailed", defaultMessage: "The file could not be saved." },
  attach: { id: "media.attachments.add", defaultMessage: "Attach files" },
  remove: { id: "media.attachments.remove", defaultMessage: "Remove file" },
  uploading: { id: "media.attachments.uploading", defaultMessage: "Adding files…" },
  cancel: { id: "media.attachments.cancelUpload", defaultMessage: "Cancel upload" },
  unavailable: { id: "media.preview.unavailable", defaultMessage: "Preview unavailable" },
  failed: { id: "media.attachments.addFailed", defaultMessage: "The file could not be added. Try again." },
}));
